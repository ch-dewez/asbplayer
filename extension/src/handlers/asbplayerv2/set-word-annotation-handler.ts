import { setWordsAnnotationWithSubtitles } from '@project/common/anki';
import { CommandHandler } from '../command-handler';
import { Command, Message, setWordAndSubtitlesMessage } from '@project/common';

export default class SetWordAnnotationWithSubtitlesHandler implements CommandHandler {
    readonly sender = 'player';
    readonly command = 'set-word-annotation-with-subtitles';

    handle(command: Command<Message>, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void): boolean {
        const { subtitles, nextAnnotation, currentAnnotation } = command.message as setWordAndSubtitlesMessage;

        setWordsAnnotationWithSubtitles(currentAnnotation, nextAnnotation, subtitles)
        .then((result) => {
            sendResponse(result);
        });

        return true;
    }
}