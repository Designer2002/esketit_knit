import { createContext, useState, useEffect, useCallback } from "react";
import { dictionary, languages } from "./dictionary";

export const I18nContext = createContext(null);

const STORAGE_KEY = "app_language";

// Определяем начальный язык
const getInitialLanguage = () => {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved && dictionary[saved]) return saved;
  // Автоопределение по языку браузера
  const browserLang = navigator.language?.split("-")[0];
  return dictionary[browserLang] ? browserLang : "ru";
};

export function I18nProvider({ children }) {
  const [lang, setLang] = useState(getInitialLanguage);

  // Сохраняем выбор в localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, lang);
  }, [lang]);

  // Функция перевода: t('start.title') => "Готовы воплотить..."
  const t = useCallback(
    (key, fallback) => {
      const text = dictionary[lang]?.[key];
      if (text !== undefined) return text;
      // Фоллбэк на русский, если нет в текущем языке
      const ruText = dictionary.ru?.[key];
      if (ruText !== undefined) return ruText;
      // Если ключа вообще нет — возвращаем fallback или сам ключ
      return fallback ?? key;
    },
    [lang],
  );

  const value = {
    lang,
    setLang,
    t,
    languages,
  };

  return (
    <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
  );
}