import Dexie from 'dexie';
import { importedConjugationSuffixesType, importedTrieElementArrayType, importedTrieRootArrayType, importedWordType, Tokenizer, TrieElement, Word } from './tokenizer';
import { TrieRoot, Suffixes } from './tokenizer';

interface TrieRecord {
    id: string;
    trie: TrieRoot;
}

interface ConjugationRecord {
    id: string;
    conjugations: Suffixes[];
}

class TrieDatabase extends Dexie {
    trieTable!: Dexie.Table<TrieRecord, string>;
    conjugationTable!: Dexie.Table<ConjugationRecord, string>;

    constructor() {
        super('JapaneseTrieDB');
        this.version(1).stores({
            trieTable: 'id',
            conjugationTable: 'id'
        });
    }
}

export class TrieStorage {
    static db: TrieDatabase;
    static trie: TrieRoot | undefined;
    static conjugationSuffixes: Suffixes[] | undefined;

   

    static async saveTrie(): Promise<void> {
        if (TrieStorage.trie === undefined) {
            throw new Error('Trie is undefined');
        }
        await TrieStorage.db.trieTable.put({
            id: 'main-trie',
            trie: TrieStorage.trie
        });
    }

    private static reconstructTrieElement(plainElement: any): TrieElement {
        const element = new TrieElement();
        Object.assign(element, plainElement);
        
        if (plainElement.word) {
            element.word = new Word(
                plainElement.word.definitions ?? [],
                plainElement.word.tags ?? [],
                plainElement.word.frequencyScore ?? 0,
                plainElement.word.frequencyPosition ?? -1
            );
        }
        
        element.childrens = plainElement.childrens.map((child: any) => 
            this.reconstructTrieElement(child)
        );
        
        return element;
    }

    static async loadTrie() {
        const result = await TrieStorage.db.trieTable.get('main-trie');
        if (result?.trie) {
            const trieRoot = new TrieRoot();
            Object.assign(trieRoot, result.trie);
            trieRoot.childrens = result.trie.childrens.map(child => 
                this.reconstructTrieElement(child)
            );
            TrieStorage.trie = trieRoot;
        }
    }

    static async saveConjugations(): Promise<void> {
        if (TrieStorage.conjugationSuffixes === undefined) {
            throw new Error('conjugationTrie is undefined');
        }
        await TrieStorage.db.conjugationTable.put({
            id: 'main-conjugations',
            conjugations: TrieStorage.conjugationSuffixes
        });
    }

    static async loadConjugations() {
        const result = await TrieStorage.db.conjugationTable.get('main-conjugations');
        if (result?.conjugations) {
            TrieStorage.conjugationSuffixes = result.conjugations.map(conjugation => {
                const suffixesTrie = new TrieRoot();
                Object.assign(suffixesTrie, conjugation.suffixesTrie);
                suffixesTrie.childrens = conjugation.suffixesTrie.childrens.map(child => 
                    this.reconstructTrieElement(child)
                );
                
                return new Suffixes(
                    conjugation.suffixeTypeTag,
                    conjugation.basicFormSuffixe,
                    suffixesTrie
                );
            });
        }
    }

    private static createWordFromArray(array: importedWordType): Word|undefined {
        if (array === null || array === undefined){
            return undefined;
        }
        let word:Word = new Word(
            array[0] ?? [],
            array[1] ?? [],
            array[2] ?? 0,
            array[3] ?? -1,
        );
        return word;
    }

    private static populateTrieFromArray(element: importedTrieRootArrayType | importedTrieElementArrayType): TrieRoot {
        let trie = new TrieRoot();

        for (const child of element[0]) {
            // create the new Elememnt
            let newElement = new TrieElement();
            newElement.isAWordEnd = child[1];
            newElement.character = child[2];
            if (child[3] !== null && child[3] !== undefined) {
                newElement.word = TrieStorage.createWordFromArray(child[3]);
            }
            newElement.childrens = TrieStorage.populateTrieFromArray(child).childrens;
            trie.childrens.push(newElement);
        }

        return trie;
    }

    private static populateConjugationSuffixesFromArray(element: importedConjugationSuffixesType[]): Suffixes[] {
        let allSuffixes: Suffixes[] = [];

        for (const child of element) {
            const suffixes: Suffixes = new Suffixes(child[0], child[1][0], TrieStorage.populateTrieFromArray(child[1][1]));
            allSuffixes.push(suffixes);
        }

        return allSuffixes;
    }

    public static async CreateDictionnaryFromFile(file: File) {
        const text = await file.text();
        const parseJson = JSON.parse(text) as [trie: importedTrieRootArrayType, conjugationSuffixes:importedConjugationSuffixesType[]];
        await TrieStorage.CreateDictionaryFromJson(parseJson);
    }
    
    public static async CreateDictionnaryFromString(text: string) {
        const parseJson = JSON.parse(text) as [trie: importedTrieRootArrayType, conjugationSuffixes:importedConjugationSuffixesType[]];
        await TrieStorage.CreateDictionaryFromJson(parseJson)
    }

    public static async CreateDictionaryFromJson(dictionary: [trie: importedTrieRootArrayType, conjugationSuffixes:importedConjugationSuffixesType[]]) {
        try {
            // Create trie and conjugations from dictionary
            const computedTrie = TrieStorage.populateTrieFromArray(dictionary[0]);
            const computedConjugations = TrieStorage.populateConjugationSuffixesFromArray(dictionary[1]);

            TrieStorage.trie = computedTrie;
            TrieStorage.conjugationSuffixes = computedConjugations;

            // Save both to database
            await TrieStorage.saveTrie();
            await TrieStorage.saveConjugations();
            
            
        } catch (error) {
            console.error('Error creating trie and conjugations from dictionary:', error);
            throw error;
        }
    }

    static async clear(): Promise<void> {
        await TrieStorage.db.trieTable.clear();
        await TrieStorage.db.conjugationTable.clear();
    }

    static {
        TrieStorage.db = new TrieDatabase();
        TrieStorage.loadTrie();
        TrieStorage.loadConjugations();
   } 
}

