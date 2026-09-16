import { useEffect } from "react";

/**
 * Canonical navigation policy for tenant menus.
 *
 * Vertical modules may keep specialized pages/routes for compatibility, but
 * duplicated top-level functions should not appear twice in the sidebar.
 * A duplicate is only hidden when the canonical destination is also present,
 * so tenants never lose access if a canonical module is disabled.
 */
const CANONICAL_NAVIGATION_ALIASES = [
  {
    canonicalHref: "/agenda",
    duplicateHrefs: ["/beauty/agenda", "/clinic/agenda"],
    canonicalLabel: "Agenda",
  },
] as const;

export function useNavigationDeduplication() {
  useEffect(() => {
    const applyPolicy = () => {
      CANONICAL_NAVIGATION_ALIASES.forEach((policy) => {
        const canonicalLinks = Array.from(
          document.querySelectorAll<HTMLAnchorElement>(`a[href="${policy.canonicalHref}"]`),
        ).filter((link) => link.offsetParent !== null || link.style.display !== "none");

        const canonicalAvailable = canonicalLinks.length > 0;

        policy.duplicateHrefs.forEach((href) => {
          document.querySelectorAll<HTMLAnchorElement>(`a[href="${href}"]`).forEach((link) => {
            if (!canonicalAvailable) {
              if (link.dataset.vendoraiDuplicateNavHidden === "true") {
                link.style.display = "";
                link.removeAttribute("aria-hidden");
                link.removeAttribute("tabindex");
                delete link.dataset.vendoraiDuplicateNavHidden;
              }
              return;
            }

            link.style.display = "none";
            link.setAttribute("aria-hidden", "true");
            link.setAttribute("tabindex", "-1");
            link.dataset.vendoraiDuplicateNavHidden = "true";
            link.dataset.vendoraiCanonicalHref = policy.canonicalHref;
            link.dataset.vendoraiCanonicalLabel = policy.canonicalLabel;
          });
        });
      });
    };

    applyPolicy();
    const observer = new MutationObserver(applyPolicy);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      document
        .querySelectorAll<HTMLAnchorElement>('a[data-vendorai-duplicate-nav-hidden="true"]')
        .forEach((link) => {
          link.style.display = "";
          link.removeAttribute("aria-hidden");
          link.removeAttribute("tabindex");
          delete link.dataset.vendoraiDuplicateNavHidden;
          delete link.dataset.vendoraiCanonicalHref;
          delete link.dataset.vendoraiCanonicalLabel;
        });
    };
  }, []);
}
