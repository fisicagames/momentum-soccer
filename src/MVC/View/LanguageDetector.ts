export class LanguageDetector {
    public static detectAndSetLanguage(changeLanguageCallback: () => void): void {
        //console.log(navigator.language);
        //For test use: Locale Switcher - Chrome extension.
        const browserLanguage = navigator.language || "en";
        if (!browserLanguage.startsWith("pt")) {
            changeLanguageCallback();
        }
        else{
            changeLanguageCallback();
            changeLanguageCallback();
        }
    }
}

