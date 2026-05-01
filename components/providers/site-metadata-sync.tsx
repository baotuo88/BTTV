"use client";

import { useEffect } from "react";
import { useSiteConfig } from "@/hooks/useSiteConfig";

export function SiteMetadataSync() {
  const siteConfig = useSiteConfig();

  useEffect(() => {
    document.title = siteConfig.siteTitle;

    const descriptionMeta = document.querySelector('meta[name="description"]');
    if (descriptionMeta) {
      descriptionMeta.setAttribute("content", siteConfig.siteDescription);
      return;
    }

    const meta = document.createElement("meta");
    meta.setAttribute("name", "description");
    meta.setAttribute("content", siteConfig.siteDescription);
    document.head.appendChild(meta);
  }, [siteConfig.siteDescription, siteConfig.siteTitle]);

  return null;
}
