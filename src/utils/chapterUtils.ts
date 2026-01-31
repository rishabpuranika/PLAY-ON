export interface Chapter {
    id: string;
    number: string | number;
    title?: string;
    date?: string;
    url?: string;
    read?: boolean;
    pages?: number;
}

export const parseChapterNumber = (chapterNumber: string | number): number => {
    if (typeof chapterNumber === 'number') return chapterNumber;

    const cleaned = chapterNumber
        .replace(/^(ch\.?|chapter|ep\.?|episode)\s*/i, '')
        .trim();
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
};

export const sortChaptersNumerically = <T extends { number: string | number }>(chapters: T[], ascending = true): T[] => {
    const sorted = [...chapters].sort((a, b) => {
        const numA = parseChapterNumber(a.number);
        const numB = parseChapterNumber(b.number);

        if (numA !== numB) {
            return ascending ? numA - numB : numB - numA;
        }
        // Fallback to string comparison if numbers are equal
        return String(a.number).localeCompare(String(b.number));
    });

    return sorted;
};
