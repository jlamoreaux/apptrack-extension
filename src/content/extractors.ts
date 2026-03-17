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

  // Try embedded app data (Greenhouse Remix, etc.)
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
              (typedItem.hiringOrganization as Record<string, unknown>)?.name as string ?? null,
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
    // Greenhouse uses Remix — job data is in window.__remixContext
    const remixContext = (window as unknown as Record<string, unknown>).__remixContext as Record<string, unknown> | undefined;
    if (!remixContext) return null;

    const state = remixContext.state as Record<string, unknown> | undefined;
    const loaderData = state?.loaderData as Record<string, unknown> | undefined;
    if (!loaderData) return null;

    // Find the route data containing the job post
    const routeData = Object.values(loaderData).find(
      (v) => v && typeof v === "object" && "jobPost" in (v as Record<string, unknown>)
    ) as Record<string, unknown> | undefined;
    if (!routeData) return null;

    const jobPost = routeData.jobPost as Record<string, unknown>;
    if (!jobPost) return null;

    // Extract salary from pay_ranges or content
    let salary: string | null = null;
    const payRanges = jobPost.pay_ranges as Array<Record<string, unknown>> | undefined;
    if (payRanges && payRanges.length > 0) {
      const range = payRanges[0]!;
      const min = range.min_value as string | undefined;
      const max = range.max_value as string | undefined;
      const currency = (range.currency_type as string) ?? "USD";
      if (min && max) {
        salary = `${currency} ${min} - ${max}`;
      } else if (min) {
        salary = `${currency} ${min}+`;
      }
    }

    // Fall back to extracting salary from content HTML
    if (!salary) {
      salary = extractSalaryFromHtml(jobPost.content as string | undefined);
    }

    // Extract company name from boardConfiguration or URL
    let company: string | null = (jobPost.company_name as string) ?? null;
    if (!company) {
      const boardConfig = routeData.boardConfiguration as Record<string, unknown> | undefined;
      const boardName = boardConfig?.name as string | undefined;
      if (boardName) {
        company = boardName;
      }
    }
    if (!company) {
      company = extractCompanyFromUrl();
    }

    return {
      title: (jobPost.title as string) ?? null,
      company,
      url: window.location.href,
      description: stripHtml(jobPost.content as string | undefined),
      location: (jobPost.job_post_location as string) ?? null,
      salary,
      jobType: null,
      postedDate: null,
    };
  } catch {
    return null;
  }
}

/**
 * Extract job data from Lever job pages
 */
function extractFromLever(): JobData | null {
  try {
    // Lever renders job data in standard HTML with known classes
    const title = document.querySelector(".posting-headline h2")?.textContent?.trim() ?? null;
    const company = document.querySelector(".posting-headline .sort-by-time")?.textContent?.trim()
      ?? extractCompanyFromUrl()
      ?? null;

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

    const description = document.querySelector(".posting-page .content")?.textContent?.trim() ?? null;

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

  return {
    title: getMeta("og:title") ?? document.title ?? null,
    company: getMeta("og:site_name") ?? null,
    url: window.location.href,
    description: getMeta("og:description") ?? getMeta("description") ?? null,
    location: null,
    salary: null,
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
    '.job-location',
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
  const company = findFirstText(companySelectors) ?? extractCompanyFromUrl();
  const location = findFirstText(locationSelectors);
  const salary = findFirstText(salarySelectors);

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
  return slug
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Extract salary information from HTML content
 */
function extractSalaryFromHtml(html: string | undefined): string | null {
  if (!html) return null;

  // Match common salary patterns: $100,000, $100k, $100,000 - $150,000
  const salaryPattern = /\$[\d,]+(?:\.\d{2})?(?:\s*k)?(?:\s*[-–—to]+\s*\$[\d,]+(?:\.\d{2})?(?:\s*k)?)?/gi;
  const matches = html.match(salaryPattern);

  if (matches && matches.length > 0) {
    // Return the first match (usually the primary range)
    return matches[0];
  }

  return null;
}

/**
 * Strip HTML tags and return plain text
 */
function stripHtml(html: string | undefined): string | null {
  if (!html) return null;
  const doc = new DOMParser().parseFromString(html, "text/html");
  const text = doc.body.textContent?.trim();
  return text && text.length > 0 ? text : null;
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
    const parts = [
      address.addressLocality,
      address.addressRegion,
      address.addressCountry,
    ].filter(Boolean);
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
