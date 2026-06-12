import { createContext, useContext, useState } from "react";

const BlueprintContext = createContext();

// Хук для удобного использования
export const useBlueprint = () => {
  const context = useContext(BlueprintContext);
  if (!context) {
    throw new Error("useBlueprint must be used within a BlueprintProvider");
  }
  return context;
};

// Провайдер, который будет оборачивать приложение
export const BlueprintProvider = ({ children }) => {
  // widestWidth — это максимальная ширина полотна, необходимая для датчиков
  const [widestWidth, setWidestWidth] = useState(0);

  return (
    <BlueprintContext.Provider value={{ widestWidth, setWidestWidth }}>
      {children}
    </BlueprintContext.Provider>
  );
};