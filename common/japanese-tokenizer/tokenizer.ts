// import kuromoji from '@sglkc/kuromoji';

// type Tokenizer = {
//     tokenize: (text: string) => kuromoji.IpadicFeatures[];
// };

// class Deferred {
//     promise: Promise<Tokenizer>;
//     resolve!: (value: Tokenizer) => void;
//     reject!: (reason: Error) => void;
//     constructor() {
//         this.promise = new Promise<Tokenizer>((resolve, reject) => {
//             this.resolve = resolve;
//             this.reject = reject;
//         });
//     }
// }

// const deferred = new Deferred();
// let isLoading = false;

// export const getTokenizer = () => {
//     if (isLoading) {
//         return deferred.promise;
//     }
//     isLoading = true;
//     const builder = kuromoji
//         .builder({ dicPath: '/assets/tokenizer/dict/' })
//         .build((err: undefined | Error, tokenizer: Tokenizer) => {
//             if (err) {
//                 console.log('has error' + err);
//                 deferred.reject(err);
//             } else {
//                 console.log('tokenizer resolved');
//                 deferred.resolve(tokenizer);
//             }
//         });
//     console.log('has build');
//     return deferred.promise;
// };

// export const tokenize = async (text: string) => {
//     const tokenizer = await getTokenizer();
//     const tokens = tokenizer.tokenize(text);
//     return tokens;
// };

// export const getBasicFormFromText = async (text: string) => {
//     const tokenizer = await getTokenizer();
//     const tokens = tokenizer.tokenize(text);
//     let basic_form = tokens.map((e) => e.basic_form);
//     return basic_form;
// };

// export const getBasicFormAndSurfaceFormFromText = async (
//     text: string
// ): Promise<{ basic_form: string; surface_form: string }[]> => {
//     const tokenizer = await getTokenizer();
//     const tokens = tokenizer.tokenize(text);
//     let forms = tokens.map((e) => {
//         return { basic_form: e.basic_form, surface_form: e.surface_form };
//     });
//     return forms;
// };

import { TrieStorage } from './trie-storage';

export class TrieRoot {
    childrens: TrieElement[] = []
    
    public containsString(text:string):boolean{
        let currentElement: TrieRoot | TrieElement = this;
        for (const letter of text) {
            const nextElement: TrieElement|undefined = currentElement.childrens.find((e) => e.character === letter);
            if(nextElement === undefined){
                return false;
            }
            currentElement = nextElement;
        }    
        return true; 
    }
}

export class TrieElement {
    childrens: TrieElement[] = []
    isAWordEnd: boolean = false
    character: string = ""
    word: Word | undefined = undefined
}

export class Word{
    readonly definitions: string[]
    readonly tags: string[]
    readonly frequencyScore: number
    readonly frequencyPosition: number

    constructor(definitions:string[], tags:string[], frequencyScore:number, frequencyPosition:number){
        this.definitions = definitions;
        this.tags = tags;
        this.frequencyScore = frequencyScore;
        this.frequencyPosition = frequencyPosition;
    }
}

export class Suffixes {
    suffixeTypeTag: string = ""
    basicFormSuffixe:string = ""
    suffixesTrie: TrieRoot 

    constructor(suffixeTypeTag:string, basicFromSuffixe:string, suffixesTrie:TrieRoot){
        this.suffixeTypeTag = suffixeTypeTag;
        this.basicFormSuffixe = basicFromSuffixe;
        this.suffixesTrie = suffixesTrie;
    }
} 

export class TokenizeWord {
    readonly basic_form: string = ""
    readonly surface_form: string = ""
    readonly definitions: string[] = []
}


type RecursionReturnType = {error: {hitError:boolean, errorDepth:number, globalError:boolean}, tokenizeWords:TokenizeWord[]};

export type importedWordType = [definitions:string[], tags: string[], frequencyScore:number, frequencyPosition:number]
export type importedTrieRootArrayType = [childrens:importedTrieElementArrayType[]];
export type importedTrieElementArrayType = [childrens:importedTrieElementArrayType[], isAWordEnd: boolean, character:string, word:importedWordType];
export type importedConjugationSuffixesType = [suffixeTypeTag:string, suffixes:[basicFormSuffixe:string, suffixesTrie:importedTrieRootArrayType]];

export class Tokenizer extends TrieStorage {

    private static maxBackTracingDepth: number = 5;
    private static maxBackTracingDepthForUnknownWords: number = 2; // if there is an unknown i'll consider if there's two known words after it that it's not a problem from that.
    private static maxLettersToSkipAfterUnknownWords: number = 40;

    // Scoring constants
    private static baseFrequencyScore: number = 100;  
    private static lengthExponent: number = 0.6;      // Now between 0 and 1 (0.6 means 60% frequency, 40% length)
    private static idealWordLength: number = 3;


    private static scoreWord(word: Word, wordText: string): number {
        if (!word) return 0;

        // Get frequency score (0-100)
        let frequencyScore = 0;
        if (word.frequencyPosition !== -1) {
            frequencyScore = Tokenizer.frequencyPositionToScore(word.frequencyPosition);
        } else {
            frequencyScore = word.frequencyScore ?? 0;
        }

        // Get length score (0-100)
        const wordLength =
            word.tags.includes('name')
                ? Tokenizer.idealWordLength
                : wordText.length;
        const lengthScore = Tokenizer.lengthToScore(wordLength);

        // Combine scores based on lengthExponent
        // lengthExponent of 0.7 means 70% frequency, 30% length
        const finalScore = (frequencyScore * Tokenizer.lengthExponent) + 
                          (lengthScore * (1 - Tokenizer.lengthExponent));

        return Math.round(finalScore);
    }

    // made with ai so i'm not enteriely sure how it works
    private static frequencyPositionToScore(position: number): number {
        if (position <= 0) return 0;
        
        const score = Tokenizer.baseFrequencyScore * (1 / Math.log(position + 1));
        
        return Math.round(score);
    }

    private static lengthToScore(wordLength: number): number {
        const lengthDifference = Math.abs(wordLength - Tokenizer.idealWordLength);
        
        // Convert difference to a score where:
        // - perfect length (diff = 0) gives max score (100)
        // - larger differences give exponentially lower scores
        const score = Tokenizer.baseFrequencyScore * Math.exp(-lengthDifference / 2);
        
        return Math.round(score);
    }

    public static async tokenizeText(text: string): Promise<TokenizeWord[]> {
        try {
            const result = await Tokenizer.tokenizeRecursion(text);
            if (result.error.hitError === false) {
                //should always be the case
                console.log(result);
                return result.tokenizeWords;
            }
        } catch (error) {
            console.log(error);
            return [];
        }

        return [];
    }

    private static async tokenizeRecursion(
        text: string,
        startIndex: number = 0,
        depth: number = 0,
        hasUnknownWordLater: boolean = false
    ): Promise<RecursionReturnType> {
        if (startIndex >= text.length) {
            return {
                error: { hitError: false, errorDepth: -1, globalError: false },
                tokenizeWords: [],
            } as RecursionReturnType;
        }
        let tokenizerWords: TokenizeWord[];

        if (Tokenizer.trie === undefined || Tokenizer.conjugationSuffixes === undefined) {
            throw new Error('Trying to tokenize but trie is undefined');
        }

        // find all the possiblewords
        let wordSearchIndex = startIndex;
        let currentElement: TrieRoot | TrieElement = Tokenizer.trie;
        let allPossibleElementEnd: { word: string; element: TrieElement; endIndexInclusive: number }[] = [];
        let currentWord: string = '';

        while (true) {
            const targetElement: TrieElement | undefined = currentElement.childrens.find(
                (e) => e.character === text[wordSearchIndex]
            );
            if (targetElement === undefined) {
                break;
            }

            currentWord += targetElement.character;

            if (targetElement.isAWordEnd) {
                allPossibleElementEnd.push({
                    word: currentWord,
                    element: targetElement,
                    endIndexInclusive: wordSearchIndex,
                });
            }

            currentElement = targetElement;
            wordSearchIndex += 1;
        }

        // add the suffixes to the words
        let wordWithSuffixeToAdd: { word: string; element: TrieElement; endIndexInclusive: number }[] = [] //instead of adding the suffixe I store both the non-suffixe and the suffixe
        //  because even if a suffixe match it can be something else
        // 食べたい　→　not a suffixe (not the past) it's tai an helper adjective
        if (allPossibleElementEnd.length > 0) {
            for (let element of allPossibleElementEnd) {
                const suffixes: Suffixes | undefined = Tokenizer.conjugationSuffixes.find((e) =>
                    element.element.word?.tags.includes(e.suffixeTypeTag)
                );
                if (suffixes === undefined) {
                    continue;
                }

                let suffixeSearchIdx = startIndex + element.word.length;
                let currentSuffixe: string = '';
                while (true) {
                    if (suffixeSearchIdx >= text.length) {
                        break;
                    }
                    const letter = text[suffixeSearchIdx];
                    if (!suffixes.suffixesTrie.containsString(currentSuffixe + letter)) {
                        break;
                    }

                    suffixeSearchIdx += 1;
                    currentSuffixe += letter;
                }

                wordWithSuffixeToAdd.push({
                    word: element.word + currentSuffixe,
                    element: element.element,
                    endIndexInclusive: element.endIndexInclusive,
                });
            }
        }

        allPossibleElementEnd.push(...wordWithSuffixeToAdd);

        let scores: { score: number; index: number }[] = [];
        //score all the words
        for (let i = 0; i < allPossibleElementEnd.length; i++) {
            let element = allPossibleElementEnd[i];
            const word = element.element.word;
            if (word === undefined) {
                continue;
            }
            const score = Tokenizer.scoreWord(word, element.word);
            scores.push({ score, index: i });
        }

        scores.sort((a, b) => b.score - a.score);

        let maxErrorDepth: number = -1;
        let maxErrorDepthIndex: number = -1;

        for (const value of scores){
            const wordText = allPossibleElementEnd[value.index].word;
            const word = allPossibleElementEnd[value.index].element.word;
            let result = await Tokenizer.tokenizeRecursion(text, startIndex + wordText.length, depth + 1, hasUnknownWordLater);
            if (result.error.globalError) {
                return result;
            }
            if (result.error.hitError === false) {
                tokenizerWords = [Tokenizer.getTokenizedTypeForWords(wordText, word)];
                tokenizerWords.push(...result.tokenizeWords);
                return {
                    error: { hitError: false, errorDepth: -1, globalError: false },
                    tokenizeWords: tokenizerWords,
                } as RecursionReturnType;
            }
            if (result.error.errorDepth > maxErrorDepth) {
                maxErrorDepth = result.error.errorDepth;
                maxErrorDepthIndex = value.index; 
            }
            if (result.error.errorDepth - depth === Tokenizer.maxBackTracingDepth) {
                result = await Tokenizer.tokenizeRecursion(text, startIndex + wordText.length, depth + 1, true);
                if (result.error.globalError) {
                    return result;
                }
                tokenizerWords = [Tokenizer.getTokenizedTypeForWords(wordText, word)];
                tokenizerWords.push(...result.tokenizeWords);
                return {
                    error: { hitError: false, errorDepth: -1, globalError: false },
                    tokenizeWords: tokenizerWords,
                } as RecursionReturnType;
            }
        };

        // we have possible words but none of them works with previous words
        if (scores.length !== 0 && startIndex !== 0) {
            return {
                error: { hitError: true, errorDepth: maxErrorDepth, globalError: false },
                tokenizeWords: [],
            } as RecursionReturnType;
        }

        // if we are at the start we won't hit Tokenizer.maxBactracingDepth so we have the do it here
        if (scores.length !== 0 && startIndex === 0) {
            const wordText = allPossibleElementEnd[maxErrorDepthIndex].word;
            const word = allPossibleElementEnd[maxErrorDepthIndex].element.word;
            let result = await Tokenizer.tokenizeRecursion(text, startIndex + wordText.length, depth + 1, true);
            if (result.error.globalError) {
                return result;
            }
            tokenizerWords = [Tokenizer.getTokenizedTypeForWords(wordText, word)];
            tokenizerWords.push(...result.tokenizeWords);
            return {
                error: { hitError: false, errorDepth: -1, globalError: false },
                tokenizeWords: tokenizerWords,
            } as RecursionReturnType;
        }

        // we hit an unknownWords maybe due to previous missed chosen word
        // if depth = 0 no previous could change that
        if (scores.length === 0 && !hasUnknownWordLater && depth !== 0) {
            return {
                error: { hitError: true, errorDepth: depth, globalError: false },
                tokenizeWords: [],
            } as RecursionReturnType;
        }

        // we hit an unknownWords not due to previous missed chosen word
        // we should skip letters and continue from there.
        for (let nbLetterToSkip = 0; nbLetterToSkip < Tokenizer.maxLettersToSkipAfterUnknownWords; nbLetterToSkip++) {
            const wordText = text.slice(startIndex, startIndex + nbLetterToSkip);
            let result = await Tokenizer.tokenizeRecursion(text, startIndex + nbLetterToSkip, depth + 1, false);
            if (result.error.globalError) {
                return result;
            }
            if (result.error.hitError === true && result.error.errorDepth - depth >= Tokenizer.maxBackTracingDepthForUnknownWords){
                // it's not the fault of this
                let result = await Tokenizer.tokenizeRecursion(text, startIndex + nbLetterToSkip, depth + 1, true);
                tokenizerWords = [Tokenizer.getTokenizedTypeForWords(wordText)];
                tokenizerWords.push(...result.tokenizeWords);
                return {
                    error: { hitError: false, errorDepth: -1, globalError: false },
                    tokenizeWords: tokenizerWords,
                } as RecursionReturnType;
            }
            if (result.error.hitError === false) {
                // todo
                tokenizerWords = [Tokenizer.getTokenizedTypeForWords(wordText)];
                tokenizerWords.push(...result.tokenizeWords);
                return {
                    error: { hitError: false, errorDepth: -1, globalError: false },
                    tokenizeWords: tokenizerWords,
                } as RecursionReturnType;
            }
        }

        return {
            error: { hitError: false, errorDepth: -1, globalError: true },
            tokenizeWords: [],
        } as RecursionReturnType;
    }

    private static getTokenizedTypeForWords(wordText: string, word?: Word): TokenizeWord {
        const verbSuffixes: Suffixes | undefined = word
            ? Tokenizer.conjugationSuffixes?.find((e) => word.tags.includes(e.suffixeTypeTag))
            : undefined;
        const basic_form = wordText + (verbSuffixes !== undefined ? verbSuffixes.basicFormSuffixe : '');
        let tokenizeWord: TokenizeWord = {
            basic_form,
            definitions: word ? word.definitions : [],
            surface_form: wordText,
        };
        return tokenizeWord;
    }
}
