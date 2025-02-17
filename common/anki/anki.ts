import { AudioClip } from '@project/common/audio-clip';
import { AnkiExportMode, Annotation, AnnotationType, CardModel, Image, SubtitleModel } from '@project/common';
import { HttpFetcher, Fetcher } from '@project/common';
import { AnkiSettings, AnkiSettingsFieldKey } from '@project/common/settings';
import sanitize from 'sanitize-filename';
import { extractText, sourceString } from '@project/common/util';
import { getBasicFormAndSurfaceFormFromText, getBasicFormFromText } from '@project/common/japanese-tokenizer/tokenizer';
import { useAppKeyBinder } from '../app/hooks/use-app-key-binder';

declare global {
    interface String {
        toWellFormed?: () => string;
    }
}

const ankiQuerySpecialCharacters = ['"', '*', '_', '\\', ':'];
const alphaNumericCharacters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

const randomString = () => {
    let string = '';

    for (let i = 0; i < 8; ++i) {
        string += alphaNumericCharacters.charAt(Math.floor(Math.random() * alphaNumericCharacters.length));
    }

    return string;
};

// Makes a file name unique with reasonable probability by appending a string of random characters.
// Leaves more room for the original file name than Anki's appended hash when `storeMediaFile`
// is called with `deleteExising` == true.
// Also, AnkiConnect Android doesn't support `deleteExisting` anyway.
const makeUniqueFileName = (fileName: string) => {
    const match = /(.*)\.(.*)/.exec(fileName);

    if (match === null || match.length < 3) {
        // Give up (not likely since we expect fileName to have an extension)
        return fileName;
    }

    const baseName = match[1];
    const exension = match[2];
    return `${baseName}_${randomString()}.${exension}`;
};

const htmlTagRegexString = '<([^/ >])*[^>]*>(.*?)</\\1>';

// Given <a><b>content</b></a> return ['<a><b>content</b></a>', '<b>content</b>', 'content']
const tagContent = (html: string) => {
    const htmlTagRegex = new RegExp(htmlTagRegexString);
    let content = html;
    let contents = [html];

    while (true) {
        const match = htmlTagRegex.exec(content);

        if (match === null || match.length < 3) {
            break;
        }

        content = match[2];
        contents.push(content);
    }

    return contents;
};

export const inheritHtmlMarkup = (original: string, markedUp: string) => {
    const htmlTagRegex = new RegExp(htmlTagRegexString, 'ig');
    const markedUpWithoutBreaklines = markedUp.replaceAll('<br>', '');
    let inherited = original;

    while (true) {
        const match = htmlTagRegex.exec(markedUpWithoutBreaklines);

        if (match === null || match.length < 3) {
            break;
        }

        let newInherited = inherited;

        if (!inherited.includes(match[0])) {
            const candidateTargets = tagContent(match[2]);

            for (const target of candidateTargets) {
                newInherited = inherited.replace(target, match[0]);

                if (newInherited !== inherited) {
                    break;
                }
            }
        }

        inherited = newInherited;
    }

    return inherited;
};

export interface ExportParams {
    text: string | undefined;
    track1: string | undefined;
    track2: string | undefined;
    track3: string | undefined;
    definition: string | undefined;
    audioClip: AudioClip | undefined;
    image: Image | undefined;
    word: string | undefined;
    source: string | undefined;
    url: string | undefined;
    customFieldValues: { [key: string]: string };
    tags: string[];
    mode: AnkiExportMode;
    ankiConnectUrl?: string;
}

export async function exportCard(card: CardModel, ankiSettings: AnkiSettings, exportMode: AnkiExportMode) {
    const anki = new Anki(ankiSettings);
    const source = sourceString(card.subtitleFileName, card.mediaTimestamp);
    let audioClip =
        card.audio === undefined
            ? undefined
            : AudioClip.fromBase64(
                  source,
                  card.subtitle.start,
                  card.subtitle.end,
                  card.audio.playbackRate ?? 1,
                  card.audio.base64,
                  card.audio.extension,
                  card.audio.error
              );

    return await anki.export({
        text: card.text ?? extractText(card.subtitle, card.surroundingSubtitles),
        track1: extractText(card.subtitle, card.surroundingSubtitles, 0),
        track2: extractText(card.subtitle, card.surroundingSubtitles, 1),
        track3: extractText(card.subtitle, card.surroundingSubtitles, 2),
        definition: card.definition,
        audioClip,
        image:
            card.image === undefined
                ? undefined
                : Image.fromBase64(
                      source,
                      card.subtitle.start,
                      card.image.base64,
                      card.image.extension,
                      card.image.error
                  ),
        word: card.word,
        source: source,
        url: card.url,
        customFieldValues: card.customFieldValues ?? {},
        tags: ankiSettings.tags,
        mode: exportMode,
    });
}

let storage = typeof chrome !== 'undefined' && chrome.storage ? chrome.storage.local : undefined;

export async function setWordsAnnotationWithSubtitles(
    currentAnnotation: Annotation,
    nextAnnotation: AnnotationType,
    subtitles: SubtitleModel[]
) {
    if (nextAnnotation === currentAnnotation.ankiAnnotationType) {
        removeUserModifiedWordAnnotation(currentAnnotation.basic_form);
    } else {
        setUserModifiedWordAnnotation(
            currentAnnotation.basic_form,
            nextAnnotation,
            currentAnnotation.ankiAnnotationType
        );
    }

    subtitles.map((subtitle) => {
        if (!subtitle.annotations || subtitle.annotations.length <= 0) {
            return subtitle;
        }
        return subtitle.annotations.map((annotation) => {
            if (annotation.basic_form === currentAnnotation.basic_form) {
                annotation.annotationType = nextAnnotation;
                return annotation;
            }

            return annotation;
        });
    });

    return subtitles;
}

function replacer(key: any, value: any) {
    if (value instanceof Map) {
        return {
            dataType: 'Map',
            value: Array.from(value.entries()), // or with spread: value: [...value]
        };
    } else {
        return value;
    }
}

function reviver(key: any, value: any) {
    if (typeof value === 'object' && value !== null) {
        if (value.dataType === 'Map') {
            return new Map(value.value);
        }
    }
    return value;
}

async function getUserModifiedWordAnnotation() {
    if (!storage) {
        console.log('no storage get');
        return undefined;
    }
    const val = await storage.get(['userModifiedWordAnnotation']).then((result) => {
        return result.userModifiedWordAnnotation;
    });

    if (val == null) {
        console.log('no value == null');
        return undefined;
    }

    return JSON.parse(val, reviver) as Map<string, { annotation: AnnotationType; ankiAnnotation: AnnotationType }>;
}

async function setUserModifiedWordAnnotation(word: string, annotation: AnnotationType, ankiAnnotation: AnnotationType) {
    if (!storage) {
        console.log('no storage set');
        return;
    }

    let currentUserModifiedWords =
        (await getUserModifiedWordAnnotation()) ??
        new Map<string, { annotation: AnnotationType; ankiAnnotation: AnnotationType }>();

    currentUserModifiedWords.set(word, { annotation, ankiAnnotation });
    storage.set({ userModifiedWordAnnotation: JSON.stringify(currentUserModifiedWords, replacer) });
}

async function removeUserModifiedWordAnnotation(word: string) {
    if (!storage) {
        return;
    }

    let currentUserModifiedWords = (await getUserModifiedWordAnnotation()) ?? new Map();

    currentUserModifiedWords.delete(word);

    storage.set({ userModifiedWordAnnotation: JSON.stringify(currentUserModifiedWords, replacer) });
}

async function getSavedKnownWord() {
    if (!storage) {
        return undefined;
    }
    const val = await storage.get(['knownWords']).then((result) => {
        return result.knownWords;
    });

    if (val == null) {
        return undefined;
    }

    return JSON.parse(val) as string[];
}

async function getSavedUnknownWords() {
    if (!storage) {
        return undefined;
    }
    const val = await storage.get(['unknownWords']).then((result) => {
        return result.unknownWords;
    });

    if (val == null) {
        return undefined;
    }

    return JSON.parse(val) as { word: string; id: number }[];
}

async function SaveNewKnownWord(knownWords: string[]) {
    if (!storage) {
        return;
    }
    let alreadyKnownWords: string[] = (await getSavedKnownWord()) ?? [];

    alreadyKnownWords.push(...knownWords);

    await storage.set({ knownWords: JSON.stringify(alreadyKnownWords) });
}

async function SaveNewUnknownWord(unknownWords: { word: string; id: number }[]) {
    if (!storage) {
        return;
    }
    let alreadyUnknownWords: { word: string; id: number }[] = (await getSavedUnknownWords()) ?? [];

    alreadyUnknownWords.push(...unknownWords);

    await storage.set({ unknownWords: JSON.stringify(alreadyUnknownWords) });
}

async function RemoveOldUnknownWords(unknownWordsToRemove: { word: string; id: number }[]) {
    if (!storage || unknownWordsToRemove.length <= 0) {
        return;
    }

    let alreadyUnknownWords = await getSavedUnknownWords();
    if (alreadyUnknownWords === undefined) {
        console.error('want to remove unknownWords but get get already unknown words');
        return;
    }

    alreadyUnknownWords = alreadyUnknownWords.filter((e) => {
        !unknownWordsToRemove.includes(e);
    });
    await storage.set({ unknownWords: JSON.stringify(alreadyUnknownWords) });
}

async function GetSavedNotInDeckWords() {
    if (!storage) {
        return undefined;
    }
    const val = await storage.get(['notInDeckWords']).then((result) => {
        return result.notInDeckWords;
    });

    if (val == null) {
        return undefined;
    }

    return JSON.parse(val) as string[];
}

async function SaveNewNotInDeckWord(notInDeckWords: string[]) {
    if (!storage) {
        return;
    }
    let alreadyNotInDeckWords: string[] = (await GetSavedNotInDeckWords()) ?? [];

    alreadyNotInDeckWords.push(...notInDeckWords);

    await storage.set({ notInDeckWords: JSON.stringify(alreadyNotInDeckWords) });
}

export async function addAnnotationsToSubtitlesArray(subtitles: SubtitleModel[], ankiSettings: AnkiSettings) {
    let startTime = performance.now();
    let text = '';

    for (const subtitleText of subtitles.map((e) => e.text)) {
        text += ' ' + subtitleText;
    }

    let knownWords = await findKnownWordsInText(text, ankiSettings);

    let resultPromises: Promise<SubtitleModel>[] = [];
    for (const subtitle of subtitles) {
        resultPromises.push(addAnnotationsToSubtitle(subtitle, knownWords, ankiSettings));
    }

    let resultSubtitles: SubtitleModel[] = [];

    await Promise.all(resultPromises).then((data) => {
        resultSubtitles = data;
    });

    const endTime = performance.now();
    console.log(`it took ${endTime - startTime}`);
    return resultSubtitles;
}

// knownWords var name should be changed
export async function addAnnotationsToSubtitle(
    subtitle: SubtitleModel,
    knownWords: { word: string; annotationType: AnnotationType; ankiAnnotationType: AnnotationType }[],
    ankiSettings: AnkiSettings
): Promise<SubtitleModel> {
    subtitle.annotations = [];
    let newSubtitle = subtitle;

    // add the annotations
    // so we need to separate words
    let forms = await getBasicFormAndSurfaceFormFromText(subtitle.text);

    // made by o3
    function escapeRegExp(str: string): string {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    for (const currentForms of forms) {
        // need to find start and end for that words
        const escapedSurfaceForm = escapeRegExp(currentForms.surface_form);
        let start = subtitle.text.search(new RegExp(escapedSurfaceForm));
        let end = start + currentForms.surface_form.length;

        let word = knownWords.find((e) => e.word === currentForms.basic_form);
        let annotationType = word?.annotationType;
        let ankiAnnotationType = word?.ankiAnnotationType;

        if (annotationType === undefined || ankiAnnotationType === undefined) {
            annotationType = AnnotationType.unknown;
            ankiAnnotationType = AnnotationType.notInDeck;
        }

        let annotation: Annotation = {
            startIndex: start,
            endIndex: end,
            annotationType: annotationType,
            word: currentForms.surface_form,
            basic_form: currentForms.basic_form,
            ankiAnnotationType,
        };
        subtitle.annotations.push(annotation);
    }

    return newSubtitle;
}

// function name need to be changed
export async function findKnownWordsInText(
    text: string,
    ankiSettings: AnkiSettings | Promise<AnkiSettings>
): Promise<{ word: string; annotationType: AnnotationType; ankiAnnotationType: AnnotationType }[]> {
    if (ankiSettings instanceof Promise) {
        ankiSettings = await ankiSettings;
    }

    let words: { word: string; annotationType: AnnotationType; ankiAnnotationType: AnnotationType }[] = [];

    // first step is to separate the text in words -> japanese tokenizer
    let basic_form = await getBasicFormFromText(text);
    basic_form = Array.from(new Set(basic_form));

    // check in the userModified word list
    const userModifiedWordAnnotation =
        (await getUserModifiedWordAnnotation()) ??
        new Map<string, { annotation: AnnotationType; ankiAnnotation: AnnotationType }>();
    let wordToRemove: string[] = [];
    for (const word of basic_form) {
        let val = userModifiedWordAnnotation.get(word);
        if (val === undefined) {
            continue;
        }
        words.push({ word: word, annotationType: val.annotation, ankiAnnotationType: val.ankiAnnotation });
        wordToRemove.push(word);
    }

    basic_form = basic_form.filter((e) => !wordToRemove.includes(e));

    // we'll chech in the already saved words lists
    const alreadyKnownWords: string[] = (await getSavedKnownWord()) ?? [];

    for (const word of basic_form) {
        if (alreadyKnownWords.includes(word)) {
            words.push({ word: word, annotationType: AnnotationType.known, ankiAnnotationType: AnnotationType.known });
        }
    }

    const alreadyUnknownWords = (await getSavedUnknownWords()) ?? [];
    let unknownWordsInText: { word: string; id: number }[] = [];
    for (const unknownWord of alreadyUnknownWords) {
        if (basic_form.includes(unknownWord.word)) {
            unknownWordsInText.push(unknownWord);
        }
    }

    const alreadyNotInDeckWords: string[] = (await GetSavedNotInDeckWords()) ?? [];

    for (const word of basic_form) {
        if (alreadyNotInDeckWords.includes(word)) {
            words.push({
                word: word,
                annotationType: AnnotationType.notInDeck,
                ankiAnnotationType: AnnotationType.notInDeck,
            });
        }
    }

    //remove them from basic_form so we don't to make useless request
    basic_form = basic_form.filter((e) => !words.map((e) => e.word).includes(e));
    basic_form = basic_form.filter((e) => !unknownWordsInText.map((e) => e.word).includes(e));

    //once we have the basic form we need to find the word in Anki
    const anki = new Anki(ankiSettings);

    let actions: any = [];
    for (const word of basic_form) {
        actions.push(anki.createFindNotesActionsWithBoth(word));
    }

    let cards: { word: string; id: number }[] = [];
    let notInDeckWordsToSave: string[] = [];
    await anki.multi(actions).then((results) => {
        for (let i = 0; i < results.length; i++) {
            const result = results[i];
            if (result.error) {
                console.log(result.error);
            }

            let word = basic_form[i];

            if (result.result.length <= 0) {
                //not in deck
                notInDeckWordsToSave.push(word);
                words.push({
                    word: word,
                    annotationType: AnnotationType.notInDeck,
                    ankiAnnotationType: AnnotationType.notInDeck,
                });
                continue;
            }
            let id = result.result[0]; // ik it's a bit weird -- 0 bcs we want the first that has been found

            cards.push({ word: word, id: id });
        }
    });

    SaveNewNotInDeckWord(notInDeckWordsToSave);

    //once we have the word we need to check if the interval is > that 1 days
    //return negative when seconds and positive if days so if we do > than 1 that will work

    let cardIds = cards.filter((card) => card.id !== undefined).map((card) => card.id);
    let intervals: number[] = await anki.getInterval(cardIds);
    // we need to check if the unknownWords we saved are still unknown
    let unknownIntervals: number[] = await anki.getInterval(unknownWordsInText.map((e) => e.id));

    let unknownWordsToRemove: { word: string; id: number }[] = [];
    for (let i = 0; i < unknownIntervals.length; i++) {
        const element = unknownWordsInText[i];
        const interval = unknownIntervals[i];

        if (interval > 1) {
            words.push({
                word: element.word,
                annotationType: AnnotationType.known,
                ankiAnnotationType: AnnotationType.known,
            });
            unknownWordsToRemove.push(element);
        } else {
            words.push({
                word: element.word,
                annotationType: AnnotationType.unknown,
                ankiAnnotationType: AnnotationType.unknown,
            });
        }
    }

    RemoveOldUnknownWords(unknownWordsToRemove);

    let knownWordsToSave: string[] = [];
    let unKnownWordsToSave: { word: string; id: number }[] = [];

    for (let i = 0; i < intervals.length; i++) {
        if (intervals[i] > 1) {
            words.push({
                word: cards[i].word,
                annotationType: AnnotationType.known,
                ankiAnnotationType: AnnotationType.known,
            });
            knownWordsToSave.push(cards[i].word);
        } else {
            words.push({
                word: cards[i].word,
                annotationType: AnnotationType.unknown,
                ankiAnnotationType: AnnotationType.unknown,
            });
            unKnownWordsToSave.push(cards[i]);
        }
    }

    // not saving unknown words because they can become known but I mean in the future I could (feature noted in notion)
    SaveNewKnownWord(knownWordsToSave);
    SaveNewUnknownWord(unKnownWordsToSave);

    return words;
}

export class Anki {
    private readonly settingsProvider: AnkiSettings;
    private readonly fetcher: Fetcher;

    constructor(settingsProvider: AnkiSettings, fetcher = new HttpFetcher()) {
        this.settingsProvider = settingsProvider;
        this.fetcher = fetcher;
    }

    async deckNames(ankiConnectUrl?: string) {
        const response = await this._executeAction('deckNames', null, ankiConnectUrl);
        return response.result;
    }

    async modelNames(ankiConnectUrl?: string) {
        const response = await this._executeAction('modelNames', null, ankiConnectUrl);
        return response.result;
    }

    async modelFieldNames(modelName: string, ankiConnectUrl?: string) {
        const response = await this._executeAction('modelFieldNames', { modelName: modelName }, ankiConnectUrl);
        return response.result;
    }

    async findNotesWithWord(word: string, ankiConnectUrl?: string) {
        const response = await this._executeAction(
            'findNotes',
            { query: this.settingsProvider.wordField + ':' + this._escapeQuery(word) },
            ankiConnectUrl
        );
        return response.result;
    }

    async findNotesWithFieldContaingWord(word: string, ankiConnectUrl?: string) {
        const response = await this._executeAction(
            'findNotes',
            { query: this.settingsProvider.wordField + ':' + '*' + this._escapeQuery(word) + '*' },
            ankiConnectUrl
        );
        return response.result;
    }

    createFindNotesActions(word: string, version?: number) {
        return {
            action: 'findNotes',
            params: { query: '*:' + this._escapeQuery(word) }, // *: = any field with exactly word
            version: version ? version : 6,
        };
    }

    createFindNotesActionsWithHtml(word: string, version?: number) {
        return {
            action: 'findNotes',
            params: { query: '*:' + '*>' + this._escapeQuery(word) + '<*' }, //*: = any field with * = anything before >word< * = anything after
            version: version ? version : 6,
        };
    }

    createFindNotesActionsWithBoth(word: string, version?: number) {
        return {
            action: 'findNotes',
            params: {
                query: '*:' + '*>' + this._escapeQuery(word) + '<*' + ' OR ' + '*:' + this._escapeQuery(word),
            }, // both combine with OR
            version: version ? version : 6,
        };
    }

    async findNotes(word: string, ankiConnectUrl?: string) {
        const response = await this._executeAction('findNotes', { query: this._escapeQuery(word) }, ankiConnectUrl);
        return response.result;
    }

    async getInterval(cardIds: number[], ankiConnectUrl?: string) {
        const response = await this._executeAction(
            'getIntervals',
            {
                cards: cardIds,
            },
            ankiConnectUrl
        );
        return response.result;
    }

    async findNotesWithWordGui(word: string, ankiConnectUrl?: string) {
        const response = await this._executeAction(
            'guiBrowse',
            { query: this.settingsProvider.wordField + ':' + this._escapeQuery(word) },
            ankiConnectUrl
        );
        return response.result;
    }

    private _escapeQuery(query: string) {
        let escaped = '';

        for (let i = 0; i < query.length; ++i) {
            const char = query[i];
            if (ankiQuerySpecialCharacters.includes(char)) {
                escaped += `\\${char}`;
            } else {
                escaped += char;
            }
        }

        return `${escaped}`;
    }

    async requestPermission(ankiConnectUrl?: string) {
        const response = await this._executeAction('requestPermission', null, ankiConnectUrl);
        return response.result;
    }

    async version(ankiConnectUrl?: string) {
        const response = await this._executeAction('version', null, ankiConnectUrl);
        return response.result;
    }

    async multi(actions: { action: string; version?: number; params?: {} }[], ankiConnectUrl?: string) {
        let params = { actions: actions };
        const response = await this._executeAction('multi', params, ankiConnectUrl);
        return response.result;
    }

    async export({
        text,
        track1,
        track2,
        track3,
        definition,
        audioClip,
        image,
        word,
        source,
        url,
        customFieldValues,
        tags,
        mode,
        ankiConnectUrl,
    }: ExportParams) {
        const fields = {};

        this._appendField(fields, this.settingsProvider.sentenceField, text, true);
        this._appendField(fields, this.settingsProvider.track1Field, track1, true);
        this._appendField(fields, this.settingsProvider.track2Field, track2, true);
        this._appendField(fields, this.settingsProvider.track3Field, track3, true);
        this._appendField(fields, this.settingsProvider.definitionField, definition, true);
        this._appendField(fields, this.settingsProvider.wordField, word, false);
        this._appendField(fields, this.settingsProvider.sourceField, source, false);
        this._appendField(fields, this.settingsProvider.urlField, url, false);

        if (customFieldValues) {
            for (const customFieldName of Object.keys(customFieldValues)) {
                this._appendField(
                    fields,
                    this.settingsProvider.customAnkiFields[customFieldName],
                    customFieldValues[customFieldName],
                    true
                );
            }
        }

        const params: any = {
            note: {
                deckName: this.settingsProvider.deck,
                modelName: this.settingsProvider.noteType,
                tags: tags,
                options: {
                    allowDuplicate: false,
                    duplicateScope: 'deck',
                    duplicateScopeOptions: {
                        deckName: this.settingsProvider.deck,
                        checkChildren: false,
                    },
                },
            },
        };

        const gui = mode === 'gui';
        const updateLast = mode === 'updateLast';

        if (this.settingsProvider.audioField && audioClip && audioClip.error === undefined) {
            const sanitizedName = this._sanitizeFileName(audioClip.name);
            const data = await audioClip.base64();

            if (data) {
                if (gui || updateLast) {
                    const fileName = (await this._storeMediaFile(sanitizedName, data, ankiConnectUrl)).result;
                    this._appendField(fields, this.settingsProvider.audioField, `[sound:${fileName}]`, false);
                } else {
                    params.note['audio'] = {
                        filename: sanitizedName,
                        data,
                        fields: [this.settingsProvider.audioField],
                    };
                }
            }
        }

        if (this.settingsProvider.imageField && image && image.error === undefined) {
            const sanitizedName = this._sanitizeFileName(image.name);
            const data = await image.base64();

            if (data) {
                if (gui || updateLast) {
                    const fileName = (await this._storeMediaFile(sanitizedName, data, ankiConnectUrl)).result;
                    this._appendField(fields, this.settingsProvider.imageField, `<img src="${fileName}">`, false);
                } else {
                    params.note['picture'] = {
                        filename: sanitizedName,
                        data,
                        fields: [this.settingsProvider.imageField],
                    };
                }
            }
        }

        params.note['fields'] = fields;

        switch (mode) {
            case 'gui':
                return (await this._executeAction('guiAddCards', params, ankiConnectUrl)).result;
            case 'updateLast':
                const recentNotes = (
                    await this._executeAction('findNotes', { query: 'added:1' }, ankiConnectUrl)
                ).result.sort();

                if (recentNotes.length === 0) {
                    throw new Error('Could not find note to update');
                }

                const lastNoteId = recentNotes[recentNotes.length - 1];
                params.note['id'] = lastNoteId;
                const infoResponse = await this._executeAction('notesInfo', { notes: [lastNoteId] });

                if (infoResponse.result.length > 0 && infoResponse.result[0].noteId === lastNoteId) {
                    const info = infoResponse.result[0];

                    this._inheritHtmlMarkupFromField('sentenceField', info, params);
                    this._inheritHtmlMarkupFromField('track1Field', info, params);
                    this._inheritHtmlMarkupFromField('track2Field', info, params);
                    this._inheritHtmlMarkupFromField('track3Field', info, params);

                    await this._executeAction('updateNoteFields', params, ankiConnectUrl);

                    if (tags.length > 0) {
                        await this._executeAction(
                            'addTags',
                            { notes: [lastNoteId], tags: tags.join(' ') },
                            ankiConnectUrl
                        );
                    }

                    if (!this.settingsProvider.wordField || !info.fields) {
                        return info.noteId;
                    }

                    const wordField = info.fields[this.settingsProvider.wordField];

                    if (!wordField || !wordField.value) {
                        return info.noteId;
                    }

                    return wordField.value;
                }

                throw new Error('Could not update last card because the card info could not be fetched');
            case 'default':
                return (await this._executeAction('addNote', params, ankiConnectUrl)).result;
            default:
                throw new Error('Unknown export mode: ' + mode);
        }
    }

    private _appendField(fields: any, fieldName: string | undefined, value: string | undefined, multiline: boolean) {
        if (!fieldName || !value) {
            return;
        }

        let newValue = multiline ? value.split('\n').join('<br>') : value;
        const existingValue = fields[fieldName];

        if (existingValue) {
            newValue = existingValue + '<br>' + newValue;
        }

        fields[fieldName] = newValue;
    }

    private _sanitizeFileName(name: string) {
        if (typeof name.toWellFormed === 'function') {
            name = name.toWellFormed();
        }

        return sanitize(name, { replacement: '_' });
    }

    private async _storeMediaFile(name: string, base64: string, ankiConnectUrl?: string) {
        return this._executeAction(
            'storeMediaFile',
            { filename: makeUniqueFileName(name), data: base64, deleteExisting: false },
            ankiConnectUrl
        );
    }

    private _inheritHtmlMarkupFromField(fieldKey: AnkiSettingsFieldKey, info: any, params: any) {
        const fieldName = this.settingsProvider[fieldKey];

        if (
            fieldName &&
            info.fields &&
            typeof info.fields[fieldName]?.value === 'string' &&
            typeof params.note.fields[fieldName] === 'string'
        ) {
            params.note.fields[fieldName] = inheritHtmlMarkup(
                params.note.fields[fieldName],
                info.fields[fieldName].value
            );
        }
    }

    private async _executeAction(action: string, params: any, ankiConnectUrl?: string) {
        const body: any = {
            action: action,
            version: 6,
        };

        if (params) {
            body['params'] = params;
        }

        const json = await this.fetcher.fetch(ankiConnectUrl || this.settingsProvider.ankiConnectUrl, body);

        if (json.error) {
            throw new Error(json.error);
        }

        return json;
    }
}
