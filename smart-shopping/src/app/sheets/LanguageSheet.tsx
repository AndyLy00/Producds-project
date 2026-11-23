// Choosing the app's language (src/i18n.ts). Each language is named in itself.
import { CheckIcon } from "@radix-ui/react-icons";
import { languages } from "../../i18n";
import { SheetClose, type SheetProps } from "../ui";

export function LanguageSheet({ app }: SheetProps<"language">) {
  return (
    <div className="sheet-form action-list">
      <SheetClose app={app} />
      {languages.map((entry) => (
        <button type="button" key={entry.id} lang={entry.id} className={`pick-row ${app.lang === entry.id ? "pick-active" : ""}`} onClick={() => app.changeLanguage(entry.id)}>
          {entry.name}
          {app.lang === entry.id && <CheckIcon />}
        </button>
      ))}
    </div>
  );
}
