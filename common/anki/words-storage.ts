import { Annotation, AnnotationType, SubtitleModel } from '@project/common';

export class wordsStorage {
    storage: chrome.storage.LocalStorageArea | undefined;

    constructor(storage?: chrome.storage.LocalStorageArea) {
        if (typeof storage === 'undefined' && typeof chrome !== 'undefined' && typeof chrome.storage !== 'undefined') {
            this.storage = chrome?.storage?.local;
            return;
        }
        this.storage = storage;
    }

    replacer(key: any, value: any) {
        if (value instanceof Map) {
            return {
                dataType: 'Map',
                value: Array.from(value.entries()), // or with spread: value: [...value]
            };
        } else {
            return value;
        }
    }

    reviver(key: any, value: any) {
        if (typeof value === 'object' && value !== null) {
            if (value.dataType === 'Map') {
                return new Map(value.value);
            }
        }
        return value;
    }

    async getUserModifiedWordAnnotation() {
        if (!this.storage) {
            console.log('no this.storage get');
            return undefined;
        }
        const val = await this.storage.get(['userModifiedWordAnnotation']).then((result) => {
            return result.userModifiedWordAnnotation;
        });

        if (val == null) {
            console.log('no value == null');
            return undefined;
        }

        return JSON.parse(val, this.reviver) as Map<
            string,
            { annotation: AnnotationType; ankiAnnotation: AnnotationType }
        >;
    }

    async setUserModifiedWordAnnotation(word: string, annotation: AnnotationType, ankiAnnotation: AnnotationType) {
        if (!this.storage) {
            console.log('no this.storage set');
            return;
        }

        let currentUserModifiedWords =
            (await this.getUserModifiedWordAnnotation()) ??
            new Map<string, { annotation: AnnotationType; ankiAnnotation: AnnotationType }>();

        currentUserModifiedWords.set(word, { annotation, ankiAnnotation });
        this.storage.set({ userModifiedWordAnnotation: JSON.stringify(currentUserModifiedWords, this.replacer) });
    }

    async removeUserModifiedWordAnnotation(word: string) {
        if (!this.storage) {
            return;
        }

        let currentUserModifiedWords = (await this.getUserModifiedWordAnnotation()) ?? new Map();

        currentUserModifiedWords.delete(word);

        this.storage.set({ userModifiedWordAnnotation: JSON.stringify(currentUserModifiedWords, this.replacer) });
    }

    async getSavedKnownWord() {
        if (!this.storage) {
            return undefined;
        }
        const val = await this.storage.get(['knownWords']).then((result) => {
            return result.knownWords;
        });

        if (val == null) {
            return undefined;
        }

        return JSON.parse(val) as string[];
    }

    async getSavedUnknownWords() {
        if (!this.storage) {
            return undefined;
        }
        const val = await this.storage.get(['unknownWords']).then((result) => {
            return result.unknownWords;
        });

        if (val == null) {
            return undefined;
        }

        return JSON.parse(val) as { word: string; id: number }[];
    }

    async SaveNewKnownWord(knownWords: string[]) {
        if (!this.storage) {
            return;
        }
        let alreadyKnownWords: string[] = (await this.getSavedKnownWord()) ?? [];

        alreadyKnownWords.push(...knownWords);

        await this.storage.set({ knownWords: JSON.stringify(alreadyKnownWords) });
    }

    async SaveNewUnknownWord(unknownWords: { word: string; id: number }[]) {
        if (!this.storage) {
            return;
        }
        let alreadyUnknownWords: { word: string; id: number }[] = (await this.getSavedUnknownWords()) ?? [];

        alreadyUnknownWords.push(...unknownWords);

        await this.storage.set({ unknownWords: JSON.stringify(alreadyUnknownWords) });
    }

    async RemoveOldUnknownWords(unknownWordsToRemove: { word: string; id: number }[]) {
        if (!this.storage || unknownWordsToRemove.length <= 0) {
            return;
        }

        let alreadyUnknownWords = await this.getSavedUnknownWords();
        if (alreadyUnknownWords === undefined) {
            console.error('want to remove unknownWords but get get already unknown words');
            return;
        }

        alreadyUnknownWords = alreadyUnknownWords.filter((e) => {
            !unknownWordsToRemove.includes(e);
        });
        await this.storage.set({ unknownWords: JSON.stringify(alreadyUnknownWords) });
    }

    async GetSavedNotInDeckWords() {
        if (!this.storage) {
            return undefined;
        }
        const val = await this.storage.get(['notInDeckWords']).then((result) => {
            return result.notInDeckWords;
        });

        if (val == null) {
            return undefined;
        }

        return JSON.parse(val) as string[];
    }

    async SaveNewNotInDeckWord(notInDeckWords: string[]) {
        if (!this.storage) {
            return;
        }
        let alreadyNotInDeckWords: string[] = (await this.GetSavedNotInDeckWords()) ?? [];

        alreadyNotInDeckWords.push(...notInDeckWords);

        await this.storage.set({ notInDeckWords: JSON.stringify(alreadyNotInDeckWords) });
    }
}
