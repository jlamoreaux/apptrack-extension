/**
 * Tests for content script extraction functions
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  extractFromJsonLd,
  extractFromMetaTags,
  extractFromHeuristics,
  formatLocation,
  formatSalary,
} from "../content/extractors";

// jsdom is configured by vitest — document and window are available

/**
 * Helper to set up DOM for testing.
 * Uses innerHTML for test-only static strings in jsdom — no XSS risk.
 */
function setDocumentContent(html: string) {
  document.documentElement.innerHTML = html; // test-only static HTML in jsdom
}

describe("extractFromJsonLd", () => {
  beforeEach(() => {
    setDocumentContent("<head></head><body></body>");
  });

  it("should extract data from a valid JobPosting JSON-LD", () => {
    setDocumentContent(`
      <head>
        <script type="application/ld+json">
          {
            "@type": "JobPosting",
            "title": "Software Engineer",
            "hiringOrganization": { "name": "Acme Corp" },
            "description": "Build cool things",
            "employmentType": "FULL_TIME",
            "datePosted": "2026-01-15",
            "jobLocation": {
              "address": {
                "addressLocality": "San Francisco",
                "addressRegion": "CA",
                "addressCountry": "US"
              }
            },
            "baseSalary": {
              "currency": "USD",
              "value": { "minValue": 120000, "maxValue": 180000 }
            }
          }
        </script>
      </head>
      <body></body>
    `);

    const result = extractFromJsonLd();
    expect(result).not.toBeNull();
    expect(result!.title).toBe("Software Engineer");
    expect(result!.company).toBe("Acme Corp");
    expect(result!.description).toBe("Build cool things");
    expect(result!.jobType).toBe("FULL_TIME");
    expect(result!.postedDate).toBe("2026-01-15");
    expect(result!.location).toBe("San Francisco, CA, US");
    expect(result!.salary).toContain("120");
    expect(result!.salary).toContain("180");
  });

  it("should handle JSON-LD arrays", () => {
    setDocumentContent(`
      <head>
        <script type="application/ld+json">
          [
            { "@type": "Organization", "name": "Ignored" },
            { "@type": "JobPosting", "title": "Designer", "hiringOrganization": { "name": "Design Co" } }
          ]
        </script>
      </head>
      <body></body>
    `);

    const result = extractFromJsonLd();
    expect(result).not.toBeNull();
    expect(result!.title).toBe("Designer");
    expect(result!.company).toBe("Design Co");
  });

  it("should return null for malformed JSON", () => {
    setDocumentContent(`
      <head>
        <script type="application/ld+json">{ invalid json }</script>
      </head>
      <body></body>
    `);

    const result = extractFromJsonLd();
    expect(result).toBeNull();
  });

  it("should return null when no JSON-LD scripts exist", () => {
    setDocumentContent("<head></head><body></body>");
    const result = extractFromJsonLd();
    expect(result).toBeNull();
  });

  it("should return null when JSON-LD is not a JobPosting", () => {
    setDocumentContent(`
      <head>
        <script type="application/ld+json">
          { "@type": "Organization", "name": "Some Org" }
        </script>
      </head>
      <body></body>
    `);

    const result = extractFromJsonLd();
    expect(result).toBeNull();
  });
});

describe("extractFromMetaTags", () => {
  beforeEach(() => {
    setDocumentContent("<head></head><body></body>");
  });

  it("should extract from OpenGraph meta tags", () => {
    setDocumentContent(`
      <head>
        <meta property="og:title" content="Senior Developer at TechCo" />
        <meta property="og:site_name" content="TechCo Careers" />
        <meta property="og:description" content="Join our team" />
      </head>
      <body></body>
    `);

    const result = extractFromMetaTags();
    expect(result.title).toBe("Senior Developer at TechCo");
    expect(result.company).toBe("TechCo Careers");
    expect(result.description).toBe("Join our team");
  });

  it("should fall back to document title when og:title is missing", () => {
    setDocumentContent(`
      <head>
        <title>My Page Title</title>
      </head>
      <body></body>
    `);

    const result = extractFromMetaTags();
    expect(result.title).toBe("My Page Title");
  });

  it("should fall back to name-based description meta tag", () => {
    setDocumentContent(`
      <head>
        <meta name="description" content="A job description" />
      </head>
      <body></body>
    `);

    const result = extractFromMetaTags();
    expect(result.description).toBe("A job description");
  });
});

describe("extractFromHeuristics", () => {
  beforeEach(() => {
    setDocumentContent("<head></head><body></body>");
  });

  it("should extract title from h1 with title class", () => {
    setDocumentContent(`
      <body>
        <h1 class="job-title">Product Manager</h1>
        <div class="company-name">BigCorp</div>
      </body>
    `);

    const result = extractFromHeuristics();
    expect(result.title).toBe("Product Manager");
    expect(result.company).toBe("BigCorp");
  });

  it("should extract from data-testid attributes", () => {
    setDocumentContent(`
      <body>
        <div data-testid="job-title">QA Engineer</div>
        <div data-testid="company-name">TestCorp</div>
      </body>
    `);

    const result = extractFromHeuristics();
    expect(result.title).toBe("QA Engineer");
    expect(result.company).toBe("TestCorp");
  });

  it("should fall back to plain h1", () => {
    setDocumentContent(`
      <body>
        <h1>Some Job Title</h1>
      </body>
    `);

    const result = extractFromHeuristics();
    expect(result.title).toBe("Some Job Title");
  });

  it("should return null when no matching elements found", () => {
    setDocumentContent("<body><p>No job info here</p></body>");

    const result = extractFromHeuristics();
    expect(result.title).toBeNull();
    expect(result.company).toBeNull();
  });
});

describe("formatLocation", () => {
  it("should return null for falsy input", () => {
    expect(formatLocation(null)).toBeNull();
    expect(formatLocation(undefined)).toBeNull();
  });

  it("should return string locations as-is", () => {
    expect(formatLocation("New York, NY")).toBe("New York, NY");
  });

  it("should format address object", () => {
    const location = {
      address: {
        addressLocality: "Austin",
        addressRegion: "TX",
        addressCountry: "US",
      },
    };
    expect(formatLocation(location)).toBe("Austin, TX, US");
  });

  it("should handle partial address objects", () => {
    const location = {
      address: {
        addressLocality: "London",
        addressCountry: "UK",
      },
    };
    expect(formatLocation(location)).toBe("London, UK");
  });

  it("should handle arrays of locations", () => {
    const locations = [
      { address: { addressLocality: "SF", addressRegion: "CA" } },
      { address: { addressLocality: "NYC", addressRegion: "NY" } },
    ];
    expect(formatLocation(locations)).toBe("SF, CA, NYC, NY");
  });

  it("should return null for empty address", () => {
    expect(formatLocation({ address: {} })).toBeNull();
  });

  it("should return null for object without address", () => {
    expect(formatLocation({ name: "somewhere" })).toBeNull();
  });
});

describe("formatSalary", () => {
  it("should return null for falsy input", () => {
    expect(formatSalary(null)).toBeNull();
    expect(formatSalary(undefined)).toBeNull();
  });

  it("should return string salary as-is", () => {
    expect(formatSalary("$100k - $150k")).toBe("$100k - $150k");
  });

  it("should return number salary as string", () => {
    expect(formatSalary(95000)).toBe("95000");
  });

  it("should format salary range with currency", () => {
    const salary = {
      currency: "USD",
      value: { minValue: 100000, maxValue: 150000 },
    };
    const result = formatSalary(salary);
    expect(result).toContain("USD");
    expect(result).toContain("100");
    expect(result).toContain("150");
  });

  it("should format single value salary", () => {
    const salary = {
      currency: "EUR",
      value: 80000,
    };
    const result = formatSalary(salary);
    expect(result).toContain("EUR");
    expect(result).toContain("80");
  });

  it("should format min-only salary", () => {
    const salary = {
      currency: "USD",
      value: { minValue: 120000 },
    };
    const result = formatSalary(salary);
    expect(result).toContain("USD");
    expect(result).toContain("120");
    expect(result).toContain("+");
  });

  it("should default to USD when no currency specified", () => {
    const salary = {
      value: 90000,
    };
    const result = formatSalary(salary);
    expect(result).toContain("USD");
  });

  it("should return null for object without value", () => {
    expect(formatSalary({ currency: "USD" })).toBeNull();
  });
});
