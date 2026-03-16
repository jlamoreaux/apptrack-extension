/**
 * Job data extraction functions
 * Extracted from content script for testability
 */

import type { JobData } from "@/shared/types";

/**
 * Extract job data from the current page
 * Uses a layered approach: JSON-LD > Meta tags > Heuristics
 */
export function extractJobData(): JobData {
  // Try JSON-LD first (most reliable)
  const jsonLdData = extractFromJsonLd();
  if (jsonLdData) {
    return jsonLdData;
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
    '[class*="company"]',
    '[data-testid*="company"]',
    ".company-name",
    ".posting-headline h2",
  ];

  const title = findFirstText(titleSelectors);
  const company = findFirstText(companySelectors);

  return {
    title,
    company,
    url: window.location.href,
    description: null,
    location: null,
    salary: null,
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
