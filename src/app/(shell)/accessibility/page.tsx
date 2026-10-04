"use client";

import { LegalPage } from "@/components/legal-page";
import { useI18n } from "@/lib/i18n";


export default function AccessibilityPage() {
  const { t } = useI18n();
  return (
    <LegalPage
      title={t("a11y.accessibility_statement")}
      subtitle={t("a11y.our_commitment_to_making_orleia_usable_f")}
      lastUpdated="October 4, 2026"
    >
      <section>
        <h2 className="text-lg font-bold tracking-tight text-foreground mb-3">1. Our Commitment</h2>
        <p>
          Orleia is committed to ensuring digital accessibility for people with disabilities. We believe that
          productivity tools should be available to everyone, regardless of ability. We are continually improving
          the user experience and applying relevant accessibility standards.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold tracking-tight text-foreground mb-3">2. Accessibility Features</h2>
        <p className="mb-3">Orleia incorporates the following accessibility features:</p>
        <ul className="list-disc pl-6 space-y-1.5">
          <li><strong>{t("a11y.accessibility_menu")}</strong> - Quick controls available from the top bar on the landing page (and in Settings → Accessibility in the app)</li>
          <li><strong>{t("a11y.reduced_motion")}</strong> - Toggleable in the accessibility menu: disables animations site-wide, freezes the animated hero background, removes smooth scrolling, and respects your system's prefers-reduced-motion setting automatically</li>
          <li><strong>{t("a11y.high_contrast")}</strong> - Toggleable mode with stronger borders, darker/lighter text, and full-opacity labels in both light and dark variants</li>
          <li><strong>{t("a11y.dyslexia_friendly_font")}</strong> - Toggleable typeface option with increased letter spacing, word spacing, and line height for easier reading</li>
          <li><strong>{t("a11y.underline_links")}</strong> - Toggleable mode that underlines every link so it can be identified without relying on color alone (WCAG 1.4.1)</li>
          <li><strong>{t("a11y.font_size_options")}</strong> - Adjustable font sizes (Small, Medium, Large) from the accessibility menu and Settings</li>
          <li><strong>{t("a11y.focus_indicators")}</strong> - Visible focus rings on all interactive elements</li>
          <li><strong>{t("a11y.accessible_onboarding")}</strong> - The setup flow (age confirmation, language, appearance, and the optional profile) is fully keyboard-navigable, with labels and focus states on every control</li>
          <li><strong>{t("a11y.keyboard_shortcuts")}</strong> - Global shortcuts (Ctrl+K search, Ctrl+Shift+N/T/H to create, Ctrl+B sidebar, Ctrl+, settings), documented in Settings → Shortcuts</li>
          <li><strong>{t("a11y.aria_labels")}</strong> - Semantic HTML and ARIA attributes where appropriate; accessibility toggles expose their state via aria-pressed</li>
          <li><strong>{t("a11y.semantic_structure")}</strong> - Proper heading hierarchy and landmark regions</li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-bold tracking-tight text-foreground mb-3">3. Standards & Legal Compliance</h2>
        <p className="mb-3">Orleia is designed to meet or exceed the following accessibility standards and legal requirements:</p>
        <ul className="list-disc pl-6 space-y-1.5">
          <li><strong>{t("a11y.wcag_2_1_level_aa")}</strong> — Web Content Accessibility Guidelines, the international standard for web accessibility</li>
          <li><strong>{t("a11y.ada_title_iii")}</strong> — Americans with Disabilities Act (United States) — digital accessibility for places of public accommodation</li>
          <li><strong>European Accessibility Act (EAA)</strong> — Directive (EU) 2019/882, effective June 2025 — accessibility requirements for digital products and services in the EU</li>
          <li><strong>{t("a11y.en_301_549")}</strong> — European standard for ICT accessibility, harmonized with WCAG 2.1 AA</li>
          <li><strong>{t("a11y.section_508")}</strong> — Rehabilitation Act (United States federal agencies and contractors)</li>
          <li><strong>{t("a11y.equality_act_2010")}</strong> — United Kingdom — duty to make reasonable adjustments for disabled users</li>
          <li><strong>{t("a11y.aoda_wcag_2_0_aa")}</strong> — Accessibility for Ontarians with Disabilities Act (Canada, Ontario)</li>
          <li><strong>{t("a11y.disability_discrimination_act_1992")}</strong> — Australian Human Rights Commission standards</li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-bold tracking-tight text-foreground mb-3">4. Known Limitations</h2>
        <p className="mb-3">
          As a local-first application with no backend, some accessibility features have inherent limitations:
        </p>
        <ul className="list-disc pl-6 space-y-1.5">
          <li>{t("a11y.screen_reader_support_depends_on_your_br")}</li>
          <li>Custom UI components may not be fully accessible with all assistive technologies</li>
          <li>The application is not tested with all available screen readers</li>
          <li>Some visual features (charts, heatmaps) may not have full text alternatives</li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-bold tracking-tight text-foreground mb-3">5. Ongoing Improvements</h2>
        <p>
          We are committed to improving accessibility with each update. Planned improvements include better screen
          reader support for charts and analytics, improved focus management in modals, and enhanced keyboard
          navigation for complex interfaces.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold tracking-tight text-foreground mb-3">6. Feedback & Contact</h2>
        <p className="mb-3">
          We welcome your feedback on the accessibility of Orleia. If you encounter any accessibility barriers,
          have difficulty using any part of the application, or have suggestions for improvement, please contact us:
        </p>
        <ul className="list-disc pl-6 space-y-1.5">
          <li><strong>Email:</strong> orleiaworkspace@gmail.com</li>
          <li><strong>Buy Me a Coffee:</strong> <a href="https://buymeacoffee.com/orleia" className="underline text-foreground">buymeacoffee.com/orleia</a></li>
        </ul>
        <p className="mt-3">
          We aim to respond to accessibility-related inquiries within 5 business days. Under the European Accessibility Act
          and ADA, we are committed to addressing accessibility barriers in a timely manner.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold tracking-tight text-foreground mb-3">7. Compatibility</h2>
        <p className="mb-3">Orleia is designed to work with:</p>
        <ul className="list-disc pl-6 space-y-1.5">
          <li>Modern browsers (Chrome, Firefox, Safari, Edge)</li>
          <li>Operating system accessibility features (screen readers, zoom, high contrast mode)</li>
          <li>{t("a11y.keyboard_only_navigation")}</li>
          <li>{t("a11y.mobile_devices_with_responsive_layout")}</li>
        </ul>
      </section>
    </LegalPage>
  );
}
