# @svar-ui/react-FileManager в EsketitKnit

## Обзор

В проекте был произведён переход с кастомного компонента `FileTree` на готовое решение `@svar-ui/react-FileManager` от svar.dev.

## Что было изменено

### 1. Удалённые файлы
- `src/FileTree/FileTree.jsx` - удалён
- `src/FileTree/FileTree.css` - удалён

### 2. Новые файлы
- `src/FileTree/FileManagerTheme.css` - кастомная тема для файлового менеджера

### 3. Обновлённые компоненты

#### CreateProject.jsx
- **Раньше**: Кастомное дерево с ручным вводом пути
- **Теперь**: `@svar-ui/react-FileManager` с корнем `/` (весь компьютер)
- **Тема**: Автоматически применяется через класс `FileManager-${theme}`

#### PatternsTab.jsx  
- **Раньше**: FileTree с корнем в домашней директории
- **Теперь**: FileManager с корнем в папке проекта (`projectPath`)
- **Фильтр**: Только `.swaga` и `.txt` файлы для импорта

#### OpenProject.jsx
- **Раньше**: FileTree с фильтром `.esketit`
- **Теперь**: FileManager с корнем `/` и фильтром на выбор только `.esketit` файлов

#### KnittingTab.jsx
- **Раньше**: FileTree с фильтром изображений
- **Теперь**: FileManager с корнем `/` и фильтром только изображений

## Темы

Файловый менеджер поддерживает 4 темы проекта через CSS переменные:

### dark-blue (по умолчанию)
```css
.FileManager-dark-blue {
  --fm-bg-color: rgba(15, 23, 42, 0.8);
  --fm-text-color: #e0e7ff;
  --fm-folder-color: #60a5fa;
  /* и т.д. */
}
```

### dark-pink
```css
.FileManager-dark-pink {
  --fm-bg-color: rgba(18, 10, 14, 0.8);
  --fm-text-color: #fce7f3;
  --fm-folder-color: #f472b6;
}
```

### light-orange
```css
.FileManager-light-orange {
  --fm-bg-color: rgba(254, 215, 170, 0.8);
  --fm-text-color: #5f370e;
  --fm-folder-color: #fb923c;
}
```

### light-green
```css
.FileManager-light-green {
  --fm-bg-color: rgba(187, 247, 208, 0.8);
  --fm-text-color: #064e3b;
  --fm-folder-color: #4ade80;
}
```

## Использование

### Базовый пример

```jsx
import { FileManager, FileNavigator } from "@svar-ui/react-FileManager";
import "../FileTree/FileManagerTheme.css";

function MyComponent() {
  const theme = "dark-blue";
  
  return (
    <div className={`FileManager-container FileManager-${theme}`}>
      <FileManager
        rootFolder="/"           // Корневая папка
        selectedPath={selected}  // Выбранный путь
        onSelect={handleSelect}  // Обработчик выбора
        showHiddenFiles={false}
        showFolders={true}
        showFiles={true}
        folderSelection={false}  // Можно ли выбирать папки
        multipleSelection={false}
      >
        <FileNavigator />
      </FileManager>
    </div>
  );
}
```

### С фильтром файлов

```jsx
// Только изображения
const imageFilter = useCallback((file) => {
  if (file.is_dir) return true;
  const ext = file.name.split('.').pop()?.toLowerCase();
  return ['png', 'jpg', 'jpeg', 'bmp', 'gif'].includes(ext);
}, []);

<FileManager
  rootFolder="/"
  fileFilter={imageFilter}
  onSelect={handleSelect}
>
  <FileNavigator />
</FileManager>
```

### С корнем в папке проекта

```jsx
<FileManager
  rootFolder={projectPath}  // Папка проекта как корень
  selectedPath={selectedFile}
  onSelect={handleSelect}
>
  <FileNavigator />
</FileManager>
```

## API компонента

### FileManager Props

| Prop | Тип | По умолчанию | Описание |
|------|-----|--------------|----------|
| `rootFolder` | string | "/" | Корневая папка для навигации |
| `selectedPath` | string | null | Выбранный путь (controlled) |
| `onSelect` | function | - | Callback при выборе файла/папки |
| `onNavigate` | function | - | Callback при навигации по папкам |
| `showHiddenFiles` | boolean | false | Показывать скрытые файлы |
| `showFolders` | boolean | true | Показывать папки |
| `showFiles` | boolean | true | Показывать файлы |
| `folderSelection` | boolean | false | Разрешить выбор папок |
| `multipleSelection` | boolean | false | Разрешить множественный выбор |
| `fileFilter` | function | null | Фильтр файлов для отображения |

### FileNavigator

Компонент для отображения навигационной панели (breadcrumb). Должен быть вложен в `FileManager`.

## CSS переменные для тем

Все переменные начинаются с префикса `--fm-`:

- `--fm-bg-color` - фон менеджера
- `--fm-text-color` - цвет текста
- `--fm-border-color` - цвет рамок
- `--fm-hover-bg-color` - фон при наведении
- `--fm-selected-bg-color` - фон выбранного элемента
- `--fm-folder-color` - цвет иконки папки
- `--fm-file-color` - цвет иконки файла
- `--fm-toolbar-bg-color` - фон тулбара
- `--fm-input-bg-color` - фон полей ввода
- `--fm-button-primary-bg-color` - фон основных кнопок
- `--fm-scrollbar-thumb-color` - цвет ползунка скролла

## Преимущества нового решения

1. **Нативный вид** - выглядит как стандартный проводник ОС
2. **Готовая навигация** - breadcrumb, переходы между папками
3. **Сортировка** - автоматическая сортировка файлов и папок
4. **Темы** - полная поддержка всех 4 тем проекта
5. **Меньше кода** - не нужно поддерживать кастомный компонент
6. **Надёжность** - готовое протестированное решение

## Зависимости

```json
{
  "@svar-ui/react-FileManager": "^2.5.0"
}
```

## Примечания

- Системный диалог можно использовать как альтернативу через `@tauri-apps/plugin-dialog`
- Для изменения стартовой папки измените prop `rootFolder`
- Для фильтрации файлов используйте `fileFilter` callback
