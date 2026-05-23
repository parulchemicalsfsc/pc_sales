import { useLanguageStore } from "../store/languageStore";
import { getTranslation, getFieldTranslation } from "../i18n/i18n";

/**
 * Custom hook for i18n translations using JSON translation files
 *
 * Usage:
 * const { t, tf } = useTranslation();
 * <h1>{t('nav.dashboard')}</h1>
 * <p>{tf('customerName')}</p>
 */
export const useTranslation = () => {
  const storeLanguage = useLanguageStore((state) => state.language);
  const language = "en"; // Force English for initial rendering

  /**
   * Translate using translation key from JSON files
   * @param key - Translation key (e.g., 'nav.dashboard', 'common.add')
   * @param fallback - Optional fallback text if key not found
   */
  const t = (key: string, fallback?: string): string => {
    const translation = getTranslation(key, language);
    // If translation is the same as key and fallback provided, use fallback
    if (translation === key && fallback) {
      return fallback;
    }
    return translation;
  };

  /**
   * Translate field names with automatic fallback
   * Useful for dynamic fields that may not be in translation files
   * @param fieldName - Field name to translate (e.g., 'customerName', 'totalAmount')
   */
  const tf = (fieldName: string): string => {
    return getFieldTranslation(fieldName, language);
  };

  return {
    t, // Translate using key from JSON files
    tf, // Translate field name with automatic fallback
    language: storeLanguage, // Current language code
  };
};
