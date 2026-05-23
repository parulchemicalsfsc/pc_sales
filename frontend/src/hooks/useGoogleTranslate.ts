import { useEffect, useState } from "react";

// Cookie helper functions
const getCookie = (name: string): string | null => {
  const nameEQ = name + "=";
  const ca = document.cookie.split(";");
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i].trim();
    if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
  }
  return null;
};

const setCookie = (name: string, value: string, days = 30) => {
  const date = new Date();
  date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
  const expires = "; expires=" + date.toUTCString();
  const host = window.location.hostname;

  // Set cookie for current path and root path
  document.cookie = `${name}=${value}${expires}; path=/`;
  document.cookie = `${name}=${value}${expires}; path=/; domain=${host}`;
  document.cookie = `${name}=${value}${expires}; path=/; domain=.${host}`;
};

const eraseCookie = (name: string) => {
  const host = window.location.hostname;
  const expired = "; expires=Thu, 01 Jan 1970 00:00:00 GMT";
  document.cookie = `${name}=${expired}; path=/`;
  document.cookie = `${name}=${expired}; path=/; domain=${host}`;
  document.cookie = `${name}=${expired}; path=/; domain=.${host}`;
};

export interface GoogleLanguage {
  code: string;
  name: string;
  countryCode?: string;
  isRTL?: boolean;
}

export const useGoogleTranslate = (
  langs: { [code: string]: GoogleLanguage },
  defaultLang: string,
  defaultLangLoadCompleteCheckerText: string,
  futureTexts: any[] = [],
  mustTranslate = false,
  translationTimeout = 5000
) => {
  const [translating, setTranslating] = useState(true);
  const [lang, setLang] = useState(defaultLang);

  useEffect(() => {
    // 1. Inject Style to hide Google Translate elements
    const styleId = "google-translate-style-overrides";
    if (!document.getElementById(styleId)) {
      const style = document.createElement("style");
      style.id = styleId;
      style.textContent = `
        #goog-gt-tt, 
        iframe.VIpgJd-ZVi9od-ORHb-OEVmcd, 
        .VIpgJd-ZVi9od-aZ2wEe-wOHMyf,
        .skiptranslate {
          display: none !important;
          height: 0px !important;
          visibility: hidden !important;
        }
        body {
          top: 0px !important;
        }
      `;
      document.head.appendChild(style);
    }

    // 2. Inject target google translate element
    const divId = "google_translate_element";
    if (!document.getElementById(divId)) {
      const div = document.createElement("div");
      div.id = divId;
      div.style.display = "none";
      document.body.insertBefore(div, document.body.firstChild);
    }

    // 3. Inject init function callback
    const scriptCallback = "googleTranslateElementInit";
    if (!(window as any)[scriptCallback]) {
      (window as any)[scriptCallback] = () => {
        new (window as any).google.translate.TranslateElement(
          {
            pageLanguage: defaultLang,
            layout: (window as any).google.translate.TranslateElement.InlineLayout.SIMPLE,
          },
          divId
        );
      };
    }

    // 4. Inject Google Translate script if not present
    const scriptSrc = `https://translate.google.com/translate_a/element.js?cb=${scriptCallback}`;
    let script = document.querySelector(`script[src^="https://translate.google.com/translate_a/element.js"]`);
    if (!script) {
      script = document.createElement("script");
      (script as HTMLScriptElement).src = scriptSrc;
      (script as HTMLScriptElement).async = true;
      document.body.appendChild(script);
    }

    // Check cookie on mount to set correct initial state
    const googt = getCookie("googtrans");
    if (googt) {
      const parts = googt.split("/");
      const targetLang = parts[parts.length - 1];
      if (targetLang && langs[targetLang]) {
        setLang(targetLang);
      }
    }

    setTranslating(false);
  }, []);

  const translate = (locale: string) => {
    if (!langs[locale]) return;

    const googt = getCookie("googtrans");
    const targetTransCode = `/${defaultLang}/${locale}`;

    if (locale === defaultLang) {
      if (googt) {
        eraseCookie("googtrans");
        setLang(defaultLang);
        window.location.hash = "";
        window.location.reload();
      }
    } else {
      if (googt !== targetTransCode) {
        setCookie("googtrans", targetTransCode);
        setLang(locale);
        window.location.reload();
      }
    }
  };

  return {
    lang,
    langs,
    isRTL: langs[lang]?.isRTL || false,
    translating,
    translate,
  };
};

export default useGoogleTranslate;
