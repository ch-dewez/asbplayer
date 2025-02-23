import { Annotation, AnnotationType, Command, Message } from '@project/common';
import { wordsStorage } from '@project/common/anki/words-storage';

class WordHighlighter {
    private originalTexts: Map<HTMLElement, string> = new Map();
    private wordsAnnotations: Annotation[][] = [];
    private computedWordsClass = 'highlighted-word';

    public parseElements(): void {
        const elements = document.querySelectorAll('body *:not(script):not(style)');
        elements.forEach((element) => {
            const el = element as HTMLElement;
            // Only process elements without child elements and with non-empty text.
            if (el.textContent && el.textContent.trim() !== '') {
                if (el.closest('style') || el.closest('script') || el.closest('noscript')) {
                    return;
                }
                for (let child of el.childNodes) {
                    if (
                        child.nodeType === Node.TEXT_NODE &&
                        child.childNodes.length === 0 &&
                        child.textContent &&
                        child.textContent.trim() !== ''
                    ) {
                        let container = document.createElement('span');
                        container.innerText = child.textContent;
                        child.replaceWith(container);
                        this.originalTexts.set(container, container.innerText);
                    }
                }
            }
        });

        let texts = Array.from(this.originalTexts.entries()).map(([el, _]) => {
            return el.textContent;
        });

        chrome.runtime.sendMessage(
            {
                sender: 'parser',
                message: {
                    command: 'add-annotations-to-string-array',
                    texts: texts,
                },
            },
            (response) => {
                if (response.error) {
                } else {
                    let result = response as { text: string; annotations: Annotation[] }[];

                    this.wordsAnnotations = result.map((e) => e.annotations);
                    this.colorWords();
                }
            }
        );
    }

    public resetElements(): void {
        this.originalTexts.forEach((original, element) => {
            element.innerHTML = original;
        });
    }

    private resetElement(el: HTMLElement) {
        el.innerText = this.originalTexts.get(el) ?? '';
    }

    public colorWords(): void {
        this.resetElements();

        Array.from(this.originalTexts.entries()).forEach(([element, original], index) => {
            let annotations = this.wordsAnnotations[index];

            // make sure they are ordered by start index
            annotations = annotations.sort((a, b) => a.startIndex - b.startIndex);
            let modifiedHtml = '';
            for (const annotation of annotations) {
                let wordClass = this.getNewClassFromAnnotationType(annotation.annotationType);
                let html = `<span class="${wordClass} ${this.computedWordsClass}">${annotation.word}</span>`;
                modifiedHtml += html;
            }

            element.innerHTML = modifiedHtml;
        });

        const spans = document.querySelectorAll(`span.${this.computedWordsClass}`);
        spans.forEach((span) => {
            span.addEventListener('click', this.changeWordColor);
        });
    }

    getNewClassFromAnnotationType(annotationType: AnnotationType) {
        return annotationType === AnnotationType.known
            ? 'knownWords'
            : annotationType === AnnotationType.unknown
            ? 'unknownWords'
            : 'notInDeckWords';
    }

    private findAndChangeColor(word: string, annotationType: AnnotationType) {
        const spansWithWord = Array.from(
            document.querySelectorAll<HTMLSpanElement>(`span.${this.computedWordsClass}`)
        ).filter((span) => span.innerText.trim() === word);

        spansWithWord.forEach((el) => {
            let wordClass = this.getNewClassFromAnnotationType(annotationType);
            el.className = `${this.computedWordsClass} ${wordClass}`;

            el.innerText = word;
        });
    }

    public changeWordColor = (event: Event): void => {
        const target = event.target as HTMLElement;
        if (!target) {
            return;
        }

        const word = target.innerText;
        let annotation: Annotation | undefined = undefined;
        let doBreak: Boolean = false;

        for (const textAnnotations of this.wordsAnnotations) {
            for (const textAnnotation of textAnnotations) {
                if (textAnnotation.word === word) {
                    annotation = textAnnotation;
                    doBreak = true;
                    break;
                }
            }
            if (doBreak) {
                break;
            }
        }

        if (annotation === undefined) {
            return;
        }

        let nextAnnotationType: AnnotationType;
        if (
            annotation.ankiAnnotationType === AnnotationType.known ||
            annotation.ankiAnnotationType === AnnotationType.unknown
        ) {
            nextAnnotationType =
                annotation.annotationType === AnnotationType.known ? AnnotationType.unknown : AnnotationType.known;
        } else {
            nextAnnotationType =
                annotation.annotationType === AnnotationType.known ? AnnotationType.notInDeck : AnnotationType.known;
        }

        chrome.runtime.sendMessage(
            {
                sender: 'parser',
                message: {
                    command: 'set-word-annotation-with-annotations-array-array',
                    currentAnnotation: annotation,
                    nextAnnotation: nextAnnotationType,
                    annotationsArrayArray: this.wordsAnnotations,
                },
            },
            (response) => {
                if (response) {
                    this.wordsAnnotations = response;
                    this.findAndChangeColor(word, nextAnnotationType);
                }
            }
        );

        if (word) {
            const spans = document.querySelectorAll(`span.highlight-word[data-word="${word}"]`);
            spans.forEach((span) => {});
        }
    };
}

let wordHighlighter = new WordHighlighter();

chrome.runtime.onMessage.addListener((request: Command<Message>, sender, sendResponse) => {
    if (request.message.command === 'parse-page') {
        wordHighlighter.parseElements();
        sendResponse();
        return false;
    }
});
