import { useContext } from "react";
import { I18nContext } from "/I18nContext";

// Использование: const { t, lang, setLang } = useT();
export function useT() {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useT must be used within I18nProvider");
  }
  return ctx;
}