import { OffscreenDomCache } from '@project/common';

export enum OffsetAnchor {
    bottom,
    top,
}

export interface KeyedHtml {
    key?: string;
    html: () => string;
}

export interface ElementOverlayParams {
    targetElement: HTMLElement;
    nonFullscreenContainerClassName: string;
    nonFullscreenContentClassName: string;
    fullscreenContainerClassName: string;
    fullscreenContentClassName: string;
    offsetAnchor: OffsetAnchor;
    contentPositionOffset?: number;
    contentWidthPercentage: number;
}

export interface ElementOverlay {
    setHtml(htmls: KeyedHtml[]): void;
    appendHtml(html: string): void;
    refresh(): void;
    hide(): void;
    dispose(): void;
    nonFullscreenContainerClassName: string;
    nonFullscreenContentClassName: string;
    fullscreenContainerClassName: string;
    fullscreenContentClassName: string;
    offsetAnchor: OffsetAnchor;
    contentPositionOffset: number;
    contentWidthPercentage: number;
}

export class CachingElementOverlay implements ElementOverlay {
    private readonly targetElement: HTMLElement;

    private readonly domCache: OffscreenDomCache = new OffscreenDomCache();

    private fullscreenContainerElement?: HTMLElement;
    private defaultContentElement?: HTMLElement;
    private nonFullscreenContainerElement?: HTMLElement;
    private nonFullscreenElementFullscreenChangeListener?: (this: any, event: Event) => any;
    private nonFullscreenStylesInterval?: NodeJS.Timer;
    private nonFullscreenElementFullscreenPollingInterval?: NodeJS.Timer;
    private fullscreenElementFullscreenChangeListener?: (this: any, event: Event) => any;
    private fullscreenElementFullscreenPollingInterval?: NodeJS.Timer;
    private fullscreenStylesInterval?: NodeJS.Timer;

    nonFullscreenContainerClassName: string;
    nonFullscreenContentClassName: string;
    fullscreenContainerClassName: string;
    fullscreenContentClassName: string;
    offsetAnchor: OffsetAnchor = OffsetAnchor.bottom;
    contentPositionOffset: number;
    contentWidthPercentage: number;

    constructor({
        targetElement,
        nonFullscreenContainerClassName,
        nonFullscreenContentClassName,
        fullscreenContainerClassName,
        fullscreenContentClassName,
        offsetAnchor,
        contentPositionOffset,
        contentWidthPercentage,
    }: ElementOverlayParams) {
        this.targetElement = targetElement;
        this.nonFullscreenContainerClassName = nonFullscreenContainerClassName;
        this.nonFullscreenContentClassName = nonFullscreenContentClassName;
        this.fullscreenContainerClassName = fullscreenContainerClassName;
        this.fullscreenContentClassName = fullscreenContentClassName;
        this.offsetAnchor = offsetAnchor;
        this.contentPositionOffset = contentPositionOffset ?? 75;
        this.contentWidthPercentage = contentWidthPercentage;
    }

    uncacheHtml() {
        this.domCache.clear();
    }

    cacheHtml(key: string, html: string) {
        this.domCache.add(key, html);
    }

    setHtml(htmls: KeyedHtml[]) {
        if (document.fullscreenElement) {
            this._displayFullscreenContentElementsWithHtml(htmls);
        } else {
            this._displayNonFullscreenContentElementsWithHtml(htmls);
        }
    }

    private _displayNonFullscreenContentElementsWithHtml(htmls: KeyedHtml[]) {
        this._displayNonFullscreenContentElements(htmls.map((html) => this._cachedContentElement(html.html, html.key)));
    }

    private _displayNonFullscreenContentElements(contentElements: HTMLElement[]) {
        for (const contentElement of contentElements) {
            contentElement.className = this.nonFullscreenContentClassName;
        }

        this._setChildren(this._nonFullscreenContainerElement(), contentElements);
    }

    private _displayFullscreenContentElementsWithHtml(htmls: KeyedHtml[]) {
        this._displayFullscreenContentElements(htmls.map((html) => this._cachedContentElement(html.html, html.key)));
    }

    private _displayFullscreenContentElements(contentElements: HTMLElement[]) {
        for (const contentElement of contentElements) {
            contentElement.className = this.fullscreenContentClassName;
        }

        this._setChildren(this._fullscreenContainerElement(), contentElements);
    }

    private _nonFullscreenContainerElement() {
        if (this.nonFullscreenContainerElement) {
            return this.nonFullscreenContainerElement;
        }

        const container = document.createElement('div');
        container.className = this.nonFullscreenContainerClassName;
        this._applyContainerStyles(container);
        document.body.appendChild(container);

        const toggle = () => {
            if (document.fullscreenElement) {
                container.style.display = 'none';
            } else {
                container.style.display = '';

                if (this.fullscreenContainerElement) {
                    this._transferChildren(this.fullscreenContainerElement, container);
                }
            }
        };

        toggle();
        this.nonFullscreenElementFullscreenChangeListener = (e) => toggle();
        this.nonFullscreenStylesInterval = setInterval(() => this._applyContainerStyles(container), 1000);
        this.nonFullscreenElementFullscreenPollingInterval = setInterval(() => toggle(), 1000);
        document.addEventListener('fullscreenchange', this.nonFullscreenElementFullscreenChangeListener);
        this.nonFullscreenContainerElement = container;
        return container;
    }

    private _fullscreenContainerElement() {
        if (this.fullscreenContainerElement) {
            return this.fullscreenContainerElement;
        }

        const container = document.createElement('div');
        container.className = this.fullscreenContainerClassName;
        this._applyContainerStyles(container);
        this._findFullscreenParentElement(container).appendChild(container);
        container.style.display = 'none';
        const that = this;

        const toggle = () => {
            if (document.fullscreenElement) {
                if (container.style.display === 'none') {
                    container.style.display = '';
                    container.remove();
                    that._findFullscreenParentElement(container).appendChild(container);
                }

                if (this.nonFullscreenContainerElement) {
                    this._transferChildren(this.nonFullscreenContainerElement, container);
                }
            } else if (!document.fullscreenElement) {
                container.style.display = 'none';
            }
        };

        toggle();
        this.fullscreenElementFullscreenChangeListener = (e) => toggle();
        this.fullscreenStylesInterval = setInterval(() => this._applyContainerStyles(container), 1000);
        this.fullscreenElementFullscreenPollingInterval = setInterval(() => toggle(), 1000);
        document.addEventListener('fullscreenchange', this.fullscreenElementFullscreenChangeListener);
        this.fullscreenContainerElement = container;
        return this.fullscreenContainerElement;
    }

    private _findFullscreenParentElement(container: HTMLElement): HTMLElement {
        const testNode = container.cloneNode(true) as HTMLElement;
        testNode.innerHTML = '&nbsp;'; // The node needs to take up some space to perform test clicks
        let current = this.targetElement.parentElement;

        if (!current) {
            return document.body;
        }

        let chosen: HTMLElement | undefined = undefined;

        do {
            const rect = current.getBoundingClientRect();

            if (
                rect.height > 0 &&
                (typeof chosen === 'undefined' ||
                    // Typescript is not smart enough to know that it's possible for 'chosen' to be defined here
                    rect.height >= (chosen as HTMLElement).getBoundingClientRect().height) &&
                this._clickable(current, testNode)
            ) {
                chosen = current;
                break;
            }

            current = current.parentElement;
        } while (current && !current.isSameNode(document.body.parentElement));

        if (chosen) {
            return chosen;
        }

        return document.body;
    }

    private _transferChildren(source: HTMLElement, destination: HTMLElement) {
        if (!source) {
            return;
        }

        while (source.firstChild) {
            destination.appendChild(source.firstChild);
        }
    }

    private _setChildren(containerElement: HTMLElement, contentElements: HTMLElement[]) {
        while (containerElement.firstChild) {
            this.domCache.return(containerElement.lastChild! as HTMLElement);
        }

        for (const contentElement of contentElements) {
            containerElement.appendChild(contentElement);
        }
    }

    private _cachedContentElement(html: () => string, key: string | undefined) {
        if (key === undefined) {
            if (!this.defaultContentElement) {
                this.defaultContentElement = document.createElement('div');
            }

            this.defaultContentElement.innerHTML = html();
            return this.defaultContentElement;
        }

        return this.domCache.get(key, html);
    }

    appendHtml(html: string) {
        if (document.fullscreenElement) {
            this._appendHtml(`${html}\n`, this.fullscreenContentClassName, this._fullscreenContainerElement());
        } else {
            this._appendHtml(`${html}\n`, this.nonFullscreenContentClassName, this._nonFullscreenContainerElement());
        }
    }

    private _appendHtml(html: string, className: string, container: HTMLElement) {
        const breakLine = document.createElement('br');
        const content = document.createElement('div');
        content.innerHTML = html;
        content.className = className;
        container.appendChild(breakLine);
        container.appendChild(content);
    }

    refresh() {
        if (this.fullscreenContainerElement) {
            this._applyContainerStyles(this.fullscreenContainerElement);
        }

        if (this.nonFullscreenContainerElement) {
            this._applyContainerStyles(this.nonFullscreenContainerElement);
        }
    }

    hide() {
        if (this.nonFullscreenElementFullscreenChangeListener) {
            document.removeEventListener('fullscreenchange', this.nonFullscreenElementFullscreenChangeListener);
        }

        if (this.nonFullscreenStylesInterval) {
            clearInterval(this.nonFullscreenStylesInterval);
        }

        if (this.nonFullscreenElementFullscreenPollingInterval) {
            clearInterval(this.nonFullscreenElementFullscreenPollingInterval);
        }

        if (this.fullscreenElementFullscreenChangeListener) {
            document.removeEventListener('fullscreenchange', this.fullscreenElementFullscreenChangeListener);
        }

        if (this.fullscreenStylesInterval) {
            clearInterval(this.fullscreenStylesInterval);
        }

        if (this.fullscreenElementFullscreenPollingInterval) {
            clearInterval(this.fullscreenElementFullscreenPollingInterval);
        }

        this.defaultContentElement?.remove();
        this.defaultContentElement = undefined;
        this.nonFullscreenContainerElement?.remove();
        this.nonFullscreenContainerElement = undefined;
        this.fullscreenContainerElement?.remove();
        this.fullscreenContainerElement = undefined;
    }

    private _applyContainerStyles(container: HTMLElement) {
        const rect = this.targetElement.getBoundingClientRect();
        container.style.left = rect.left + rect.width / 2 + 'px';

        if (this.contentWidthPercentage === -1) {
            container.style.maxWidth = rect.width + 'px';
            container.style.width = '';
        } else {
            container.style.maxWidth = '';
            container.style.width = (rect.width * this.contentWidthPercentage) / 100 + 'px';
        }

        const clampedY = Math.max(rect.top + window.scrollY, 0);

        if (this.offsetAnchor === OffsetAnchor.bottom) {
            const clampedHeight = Math.min(clampedY + rect.height, window.innerHeight);
            container.style.top = clampedHeight - this.contentPositionOffset + 'px';
            container.style.bottom = '';
        } else {
            container.style.top = clampedY + this.contentPositionOffset + 'px';
            container.style.bottom = '';
        }
    }

    private _clickable(container: HTMLElement, element: HTMLElement): boolean {
        container.appendChild(element);
        const rect = element.getBoundingClientRect();
        const clickedElement = document.elementFromPoint(rect.x, rect.y);
        const clickable = element.isSameNode(clickedElement) || element.contains(clickedElement);
        element.remove();
        return clickable;
    }

    dispose() {
        this.hide();
        this.domCache.clear();
    }
}

export class DefaultElementOverlay implements ElementOverlay {
    private readonly targetElement: HTMLElement;

    private fullscreenContainerElement?: HTMLElement;
    private fullscreenContentElement?: HTMLElement;
    private nonFullscreenContainerElement?: HTMLElement;
    private nonFullscreenContentElement?: HTMLElement;
    private nonFullscreenElementFullscreenChangeListener?: (this: any, event: Event) => any;
    private nonFullscreenStylesInterval?: NodeJS.Timer;
    private nonFullscreenElementFullscreenPollingInterval?: NodeJS.Timer;
    private fullscreenElementFullscreenChangeListener?: (this: any, event: Event) => any;
    private fullscreenElementFullscreenPollingInterval?: NodeJS.Timer;
    private fullscreenStylesInterval?: NodeJS.Timer;

    nonFullscreenContainerClassName: string;
    nonFullscreenContentClassName: string;
    fullscreenContainerClassName: string;
    fullscreenContentClassName: string;
    contentPositionOffset: number;
    offsetAnchor: OffsetAnchor = OffsetAnchor.bottom;
    contentWidthPercentage: number;

    constructor({
        targetElement,
        nonFullscreenContainerClassName,
        nonFullscreenContentClassName,
        fullscreenContainerClassName,
        fullscreenContentClassName,
        offsetAnchor,
        contentPositionOffset,
        contentWidthPercentage,
    }: ElementOverlayParams) {
        this.targetElement = targetElement;
        this.nonFullscreenContainerClassName = nonFullscreenContainerClassName;
        this.nonFullscreenContentClassName = nonFullscreenContentClassName;
        this.fullscreenContainerClassName = fullscreenContainerClassName;
        this.fullscreenContentClassName = fullscreenContentClassName;
        this.offsetAnchor = offsetAnchor;
        this.contentPositionOffset = contentPositionOffset ?? 75;
        this.contentWidthPercentage = contentWidthPercentage;
    }

    uncacheHtml(): void {}

    cacheHtml(html: string, key: string): void {}

    setHtml(htmls: KeyedHtml[]) {
        const html = `${htmls.map((html) => html.html()).join('\n')}\n`;
        this._nonFullscreenContentElement().innerHTML = html;
        this._fullscreenContentElement().innerHTML = html;
    }

    appendHtml(html: string) {
        const currentHtml = this._nonFullscreenContentElement().innerHTML;
        const newHtml = currentHtml && currentHtml.length > 0 ? currentHtml + '<br>' + html : html;
        this._nonFullscreenContentElement().innerHTML = `${newHtml}\n`;
        this._fullscreenContentElement().innerHTML = `${newHtml}\n`;
    }

    refresh() {
        if (this.fullscreenContainerElement) {
            this._applyContainerStyles(this.fullscreenContainerElement);
        }

        if (this.nonFullscreenContainerElement) {
            this._applyContainerStyles(this.nonFullscreenContainerElement);
        }
    }

    hide() {
        if (this.nonFullscreenContentElement) {
            if (this.nonFullscreenElementFullscreenChangeListener) {
                document.removeEventListener('fullscreenchange', this.nonFullscreenElementFullscreenChangeListener);
            }

            if (this.nonFullscreenStylesInterval) {
                clearInterval(this.nonFullscreenStylesInterval);
            }

            if (this.nonFullscreenElementFullscreenPollingInterval) {
                clearInterval(this.nonFullscreenElementFullscreenPollingInterval);
            }

            this.nonFullscreenContentElement.remove();
            this.nonFullscreenContainerElement?.remove();
            this.nonFullscreenContainerElement = undefined;
            this.nonFullscreenContentElement = undefined;
        }

        if (this.fullscreenContentElement) {
            if (this.fullscreenElementFullscreenChangeListener) {
                document.removeEventListener('fullscreenchange', this.fullscreenElementFullscreenChangeListener);
            }

            if (this.fullscreenStylesInterval) {
                clearInterval(this.fullscreenStylesInterval);
            }

            if (this.fullscreenElementFullscreenPollingInterval) {
                clearInterval(this.fullscreenElementFullscreenPollingInterval);
            }

            this.fullscreenContentElement.remove();
            this.fullscreenContainerElement?.remove();
            this.fullscreenContainerElement = undefined;
            this.fullscreenContentElement = undefined;
        }
    }

    private _nonFullscreenContentElement(): HTMLElement {
        if (this.nonFullscreenContentElement) {
            return this.nonFullscreenContentElement;
        }

        const div = document.createElement('div');
        const container = document.createElement('div');
        container.appendChild(div);
        container.className = this.nonFullscreenContainerClassName;
        div.className = this.nonFullscreenContentClassName;
        this._applyContainerStyles(container);
        document.body.appendChild(container);

        function toggle() {
            if (document.fullscreenElement) {
                container.style.display = 'none';
            } else {
                container.style.display = '';
            }
        }

        toggle();
        this.nonFullscreenElementFullscreenChangeListener = (e) => toggle();
        this.nonFullscreenStylesInterval = setInterval(() => this._applyContainerStyles(container), 1000);
        this.nonFullscreenElementFullscreenPollingInterval = setInterval(() => toggle(), 1000);
        document.addEventListener('fullscreenchange', this.nonFullscreenElementFullscreenChangeListener);
        this.nonFullscreenContentElement = div;
        this.nonFullscreenContainerElement = container;

        return this.nonFullscreenContentElement;
    }

    private _applyContainerStyles(container: HTMLElement) {
        const rect = this.targetElement.getBoundingClientRect();
        container.style.left = rect.left + rect.width / 2 + 'px';

        if (this.contentWidthPercentage === -1) {
            container.style.maxWidth = rect.width + 'px';
            container.style.width = '';
        } else {
            container.style.maxWidth = '';
            container.style.width = (rect.width * this.contentWidthPercentage) / 100 + 'px';
        }

        const clampedY = Math.max(rect.top + window.scrollY, 0);

        if (this.offsetAnchor === OffsetAnchor.bottom) {
            const clampedHeight = Math.min(clampedY + rect.height, window.innerHeight);
            container.style.top = clampedHeight - this.contentPositionOffset + 'px';
            container.style.bottom = '';
        } else {
            container.style.top = clampedY + this.contentPositionOffset + 'px';
            container.style.bottom = '';
        }
    }

    private _fullscreenContentElement(): HTMLElement {
        if (this.fullscreenContentElement) {
            return this.fullscreenContentElement;
        }

        const div = document.createElement('div');
        const container = document.createElement('div');
        container.appendChild(div);
        container.className = this.fullscreenContainerClassName;
        div.className = this.fullscreenContentClassName;
        this._applyContainerStyles(container);
        this._findFullscreenParentElement(container).appendChild(container);
        container.style.display = 'none';
        const that = this;

        function toggle() {
            if (document.fullscreenElement && container.style.display === 'none') {
                container.style.display = '';
                container.remove();
                that._findFullscreenParentElement(container).appendChild(container);
            } else if (!document.fullscreenElement) {
                container.style.display = 'none';
            }
        }

        toggle();
        this.fullscreenElementFullscreenChangeListener = (e) => toggle();
        this.fullscreenStylesInterval = setInterval(() => this._applyContainerStyles(container), 1000);
        this.fullscreenElementFullscreenPollingInterval = setInterval(() => toggle(), 1000);
        document.addEventListener('fullscreenchange', this.fullscreenElementFullscreenChangeListener);
        this.fullscreenContentElement = div;
        this.fullscreenContainerElement = container;

        return this.fullscreenContentElement;
    }

    private _findFullscreenParentElement(container: HTMLElement): HTMLElement {
        const testNode = container.cloneNode(true) as HTMLElement;
        testNode.innerHTML = '&nbsp;'; // The node needs to take up some space to perform test clicks
        let current = this.targetElement.parentElement;

        if (!current) {
            return document.body;
        }

        let chosen: HTMLElement | undefined = undefined;

        do {
            const rect = current.getBoundingClientRect();

            if (
                rect.height > 0 &&
                (typeof chosen === 'undefined' ||
                    // Typescript is not smart enough to know that it's possible for 'chosen' to be defined here
                    rect.height >= (chosen as HTMLElement).getBoundingClientRect().height) &&
                this._clickable(current, testNode)
            ) {
                chosen = current;
                break;
            }

            current = current.parentElement;
        } while (current && !current.isSameNode(document.body.parentElement));

        if (chosen) {
            return chosen;
        }

        return document.body;
    }

    private _clickable(container: HTMLElement, element: HTMLElement): boolean {
        container.appendChild(element);
        const rect = element.getBoundingClientRect();
        const clickedElement = document.elementFromPoint(rect.x, rect.y);
        const clickable = element.isSameNode(clickedElement) || element.contains(clickedElement);
        element.remove();
        return clickable;
    }

    dispose() {
        this.hide();
    }
}
