export const captureVisibleTab = (tabId: number): Promise<string> => {
    return new Promise((resolve, reject) => {
        chrome.tabs.get(tabId, (tab) => {
            chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg' }, async (dataUrl) => {
                resolve(dataUrl);
            });
        });
    });
};
