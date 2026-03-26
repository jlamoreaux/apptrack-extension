/**
 * Job data extraction functions
 * Extracted from content script for testability
 */

import type { JobData } from "@/shared/types";

/**
 * Extract job data from the current page
 * Uses a layered approach: JSON-LD > Embedded App Data > Meta tags > Heuristics
 */
export function extractJobData(): JobData {
  // Try JSON-LD first (most reliable)
  const jsonLdData = extractFromJsonLd();
  if (jsonLdData) {
    return jsonLdData;
  }

  // Try embedded app data (Greenhouse DOM, Lever, etc.)
  const appData = extractFromEmbeddedAppData();
  if (appData) {
    return appData;
  }

  // Fall back to meta tags
  const metaData = extractFromMetaTags();
  if (metaData.title || metaData.company) {
    return metaData;
  }

  // Fall back to heuristics
  return extractFromHeuristics();
}

/**
 * Extract job data from JSON-LD structured data
 */
export function extractFromJsonLd(): JobData | null {
  const scripts = document.querySelectorAll('script[type="application/ld+json"]');

  for (const script of scripts) {
    try {
      const data: unknown = JSON.parse(script.textContent ?? "");

      // Handle both single objects and arrays
      const items = Array.isArray(data) ? data : [data];

      for (const item of items) {
        const typedItem = item as Record<string, unknown>;
        if (typedItem["@type"] === "JobPosting") {
          return {
            title: (typedItem.title as string) ?? null,
            company:
              ((typedItem.hiringOrganization as Record<string, unknown>)?.name as string) ?? null,
            url: window.location.href,
            description: (typedItem.description as string) ?? null,
            location: formatLocation(typedItem.jobLocation),
            salary: formatSalary(typedItem.baseSalary),
            jobType: (typedItem.employmentType as string) ?? null,
            postedDate: (typedItem.datePosted as string) ?? null,
          };
        }
      }
    } catch {
      // Invalid JSON, continue to next script
    }
  }

  return null;
}

/**
 * Extract job data from embedded JavaScript app data
 * Supports Greenhouse (Remix), Lever, and similar SPA job boards
 */
export function extractFromEmbeddedAppData(): JobData | null {
  const hostname = window.location.hostname;

  // Greenhouse (job-boards.greenhouse.io or embedded boards)
  if (hostname.includes("greenhouse.io") || hostname.includes("greenhouse-hosted")) {
    return extractFromGreenhouse();
  }

  // Lever (jobs.lever.co)
  if (hostname.includes("lever.co")) {
    return extractFromLever();
  }

  return null;
}

/**
 * Extract job data from Greenhouse's Remix app context
 */
function extractFromGreenhouse(): JobData | null {
  try {
    // Greenhouse clears __remixContext after hydration, so we use DOM extraction
    const title = document.querySelector("h1")?.textContent?.trim() ?? null;
    if (!title) return null;

    // Company from page title ("Job Application for Role at Company")
    const company = extractCompanyFromPageTitle() ?? extractCompanyFromUrl();

    // Location is next to the h1 in the job header
    const h1 = document.querySelector("h1");
    const locationEl =
      h1?.parentElement?.querySelector("div:not(:has(h1))") ??
      h1?.parentElement?.parentElement?.querySelector('[class*="location"]');
    let location: string | null = null;
    if (locationEl) {
      // Get text but skip any img alt text
      const locText = locationEl.textContent?.trim();
      if (locText && locText.length < 200) {
        location = locText;
      }
    }

    // Salary: scan paragraphs for dollar amount patterns
    const salary = extractSalaryFromDom();

    // Description: grab the first substantial content section after the job header.
    // Look for sections containing paragraphs/lists (typical job description blocks),
    // regardless of heading text.
    let description: string | null = null;
    const h1Parent = h1?.closest("section, article, div");
    const allSections = document.querySelectorAll("section, article, div > h2, div > h3");
    for (const node of allSections) {
      // Skip the header section itself
      if (h1Parent && (node === h1Parent || h1Parent.contains(node))) continue;
      const container = node.tagName === "H2" || node.tagName === "H3" ? node.parentElement : node;
      if (!container) continue;
      const hasParagraphs = container.querySelectorAll("p, ul, ol").length >= 1;
      const text = container.textContent?.trim();
      if (hasParagraphs && text && text.length > 100) {
        description = text.substring(0, 5000);
        break;
      }
    }

    return {
      title,
      company,
      url: window.location.href,
      description,
      location,
      salary,
      jobType: null,
      postedDate: null,
    };
  } catch {
    return null;
  }
}

/**
 * Scan DOM paragraphs for salary/compensation patterns
 */
function extractSalaryFromDom(): string | null {
  const salaryPattern =
    /\$[\d,]+(?:\.\d{2})?(?:\s*[-–—]\s*\$[\d,]+(?:\.\d{2})?)?(?:\s*(?:USD|CAD|GBP|EUR|per\s+\w+))?/i;
  const paragraphs = document.querySelectorAll("p");
  for (const p of paragraphs) {
    const text = p.textContent?.trim();
    if (text) {
      const match = text.match(salaryPattern);
      if (match) return match[0];
    }
  }
  return null;
}

/**
 * Extract job data from Lever job pages
 */
function extractFromLever(): JobData | null {
  try {
    // Lever renders job data in standard HTML with known classes
    const title = document.querySelector(".posting-headline h2")?.textContent?.trim() ?? null;
    const company =
      document.querySelector(".posting-headline .sort-by-time")?.textContent?.trim() ??
      extractCompanyFromUrl() ??
      null;

    // Lever has commitment, location, team in posting-categories
    const categories = document.querySelectorAll(".posting-categories .sort-by-time");
    let location: string | null = null;
    const parts: string[] = [];
    categories.forEach((el) => {
      const text = el.textContent?.trim();
      if (text) parts.push(text);
    });
    if (parts.length > 0) {
      location = parts.join(" / ");
    }

    const description =
      document.querySelector(".posting-page .content")?.textContent?.trim() ?? null;

    if (!title) return null;

    return {
      title,
      company,
      url: window.location.href,
      description,
      location,
      salary: null,
      jobType: null,
      postedDate: null,
    };
  } catch {
    return null;
  }
}

/**
 * Extract job data from meta tags
 */
export function extractFromMetaTags(): JobData {
  const getMeta = (name: string): string | null => {
    const el =
      document.querySelector(`meta[property="${name}"]`) ??
      document.querySelector(`meta[name="${name}"]`);
    return el?.getAttribute("content") ?? null;
  };

  let company = getMeta("og:site_name") ?? null;
  let location: string | null = null;
  const ogDescription = getMeta("og:description") ?? getMeta("description") ?? null;

  // Parse company from page title pattern "... at {Company}" or "... - {Company}"
  if (!company) {
    company = extractCompanyFromPageTitle();
  }

  // On Greenhouse pages, og:description is often the location string
  const hostname = window.location.hostname;
  if (hostname.includes("greenhouse.io") && ogDescription && !ogDescription.includes(".")) {
    location = ogDescription;
  }

  // Prefer h1 over generic og:title/page titles like "Job Details | Company"
  const ogTitle = getMeta("og:title");
  const h1Title = document.querySelector("h1")?.textContent?.trim() ?? null;
  const title =
    (h1Title && h1Title.length < 200 ? h1Title : null) ?? ogTitle ?? document.title ?? null;

  // Try DOM-based fallbacks for location and salary
  if (!location) {
    location = extractLocationNearTitle();
  }
  const salary = extractSalaryFromDom();

  return {
    title,
    company,
    url: window.location.href,
    description: location === ogDescription ? null : ogDescription,
    location,
    salary,
  };
}

/**
 * Extract job data using DOM heuristics
 */
export function extractFromHeuristics(): JobData {
  // Common selectors for job titles
  const titleSelectors = [
    'h1[class*="title"]',
    'h1[class*="job"]',
    '[data-testid*="title"]',
    ".job-title",
    ".posting-headline h1",
    "h1",
  ];

  // Common selectors for company names
  const companySelectors = [
    '[class*="company-name"]',
    '[class*="companyName"]',
    '[data-testid*="company"]',
    ".company-name",
    ".posting-headline h2",
    '[class*="employer"]',
    '[class*="hiring"]',
  ];

  // Common selectors for location
  const locationSelectors = [
    '[class*="location"]',
    '[data-testid*="location"]',
    ".job-location",
    '[class*="workplace"]',
  ];

  // Common selectors for salary/compensation
  const salarySelectors = [
    '[class*="salary"]',
    '[class*="compensation"]',
    '[class*="pay-range"]',
    '[data-testid*="salary"]',
    '[data-testid*="compensation"]',
  ];

  const title = findFirstText(titleSelectors);
  const company =
    findFirstText(companySelectors) ?? extractCompanyFromPageTitle() ?? extractCompanyFromUrl();

  // Try CSS selectors first, then fall back to DOM scanning
  const location = findFirstText(locationSelectors) ?? extractLocationNearTitle();
  const salary = findFirstText(salarySelectors) ?? extractSalaryFromDom();

  return {
    title,
    company,
    url: window.location.href,
    description: null,
    location,
    salary,
  };
}

/**
 * Try to extract location from a subtitle/paragraph near the h1
 * Many career pages put "Department | Location | Remote" right after the title
 */
function extractLocationNearTitle(): string | null {
  const h1 = document.querySelector("h1");
  if (!h1) return null;

  // Check the next sibling paragraph
  const sibling = h1.nextElementSibling;
  if (sibling && (sibling.tagName === "P" || sibling.tagName === "DIV")) {
    const text = sibling.textContent?.trim();
    if (text && text.length < 200) {
      // Generic location heuristic: match "Remote" or comma-separated patterns
      // like "City, State", "City, Country", "City, ST" (2-letter abbreviation)
      const hasRemote = /\bremote\b/i.test(text);
      const hasCityStatePattern = /[A-Z][a-zA-Z\s]+,\s*[A-Z][a-zA-Z\s]+/.test(text);
      if (hasRemote || hasCityStatePattern) {
        return text;
      }
    }
  }

  return null;
}

/**
 * Find first matching element's text content
 */
export function findFirstText(selectors: string[]): string | null {
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    const text = el?.textContent?.trim();
    if (text && text.length > 0 && text.length < 200) {
      return text;
    }
  }
  return null;
}

/**
 * Extract company name from common page title patterns
 * e.g. "Job Application for Role at Company" or "Role - Company"
 */
function extractCompanyFromPageTitle(): string | null {
  const title = document.title;
  if (!title) return null;

  // "... at Company" (Greenhouse pattern: "Job Application for Role at Company")
  const atMatch = title.match(/\bat\s+([^|–—-]+?)\s*$/i);
  if (atMatch?.[1]) {
    return stripCompanySuffixes(atMatch[1].trim());
  }

  // "Role - Company" or "Role | Company"
  const separatorMatch = title.match(/[-|–—]\s*([^-|–—]+?)\s*$/);
  if (separatorMatch?.[1]) {
    const candidate = separatorMatch[1].trim();
    // Avoid returning generic suffixes like "Careers" or "Jobs"
    if (candidate.length > 1 && !/^(careers|jobs|hiring)$/i.test(candidate)) {
      return stripCompanySuffixes(candidate);
    }
  }

  return null;
}

/**
 * Strip common job board suffixes from a company name.
 * e.g., "Canva Careers" -> "Canva", "Google Jobs" -> "Google"
 */
function stripCompanySuffixes(name: string): string {
  const suffixPattern = /\s+(?:Careers|Career|Jobs|Job Board|Hiring|Work|Team)$/i;
  const stripped = name.replace(suffixPattern, "").trim();
  return stripped.length > 0 ? stripped : name;
}

/**
 * Extract company name from URL for known job board domains
 */
function extractCompanyFromUrl(): string | null {
  const url = window.location;
  const hostname = url.hostname;
  const pathParts = url.pathname.split("/").filter(Boolean);

  // Greenhouse: job-boards.greenhouse.io/{company}/jobs/...
  if (hostname.includes("greenhouse.io") && pathParts[0]) {
    return formatCompanySlug(pathParts[0]);
  }

  // Lever: jobs.lever.co/{company}/...
  if (hostname.includes("lever.co") && pathParts[0]) {
    return formatCompanySlug(pathParts[0]);
  }

  // Ashby: jobs.ashbyhq.com/{company}/...
  if (hostname.includes("ashbyhq.com") && pathParts[0]) {
    return formatCompanySlug(pathParts[0]);
  }

  // Workday: {company}.wd5.myworkdayjobs.com/...
  if (hostname.includes("myworkdayjobs.com")) {
    const subdomain = hostname.split(".")[0];
    if (subdomain) return formatCompanySlug(subdomain);
  }

  return null;
}

/**
 * Convert a URL slug to a readable company name
 * e.g., "cloudflare" → "Cloudflare", "my-company" → "My Company"
 */
function formatCompanySlug(slug: string): string {
  return slug.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Format location from JSON-LD JobLocation
 */
export function formatLocation(jobLocation: unknown): string | null {
  if (!jobLocation) return null;

  if (typeof jobLocation === "string") {
    return jobLocation;
  }

  if (Array.isArray(jobLocation)) {
    const locations = jobLocation
      .map((loc) => formatLocation(loc))
      .filter((loc): loc is string => loc !== null);
    return locations.length > 0 ? locations.join(", ") : null;
  }

  const loc = jobLocation as Record<string, unknown>;
  const address = loc.address as Record<string, string> | undefined;

  if (address) {
    const parts = [address.addressLocality, address.addressRegion, address.addressCountry].filter(
      Boolean
    );
    return parts.length > 0 ? parts.join(", ") : null;
  }

  return null;
}

/**
 * Format salary from JSON-LD baseSalary
 */
export function formatSalary(baseSalary: unknown): string | null {
  if (!baseSalary) return null;

  if (typeof baseSalary === "string" || typeof baseSalary === "number") {
    return String(baseSalary);
  }

  const salary = baseSalary as Record<string, unknown>;
  const value = salary.value as Record<string, unknown> | number | undefined;
  const currency = (salary.currency as string) ?? "USD";

  if (typeof value === "number") {
    return `${currency} ${value.toLocaleString()}`;
  }

  if (value && typeof value === "object") {
    const min = value.minValue as number | undefined;
    const max = value.maxValue as number | undefined;

    if (min && max) {
      return `${currency} ${min.toLocaleString()} - ${max.toLocaleString()}`;
    }
    if (min) {
      return `${currency} ${min.toLocaleString()}+`;
    }
  }

  return null;
}
