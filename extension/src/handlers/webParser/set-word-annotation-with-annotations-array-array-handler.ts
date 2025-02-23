import { setWordsAnnotationWithAnnotationsArrayArray, setWordsAnnotationWithSubtitles } from '@project/common/anki';
import { CommandHandler } from '../command-handler';
import { Command, Message, setWordAndAnnotationsArrayArrayMessage, setWordAndSubtitlesMessage } from '@project/common';

export default class SetWordAnnotationWithAnnotationsArrayArrayHandler implements CommandHandler {
    readonly sender = 'parser';
    readonly command = 'set-word-annotation-with-annotations-array-array';

    handle(
        command: Command<Message>,
        sender: chrome.runtime.MessageSender,
        sendResponse: (response?: any) => void
    ): boolean {
        const { annotationsArrayArray, nextAnnotation, currentAnnotation } =
            command.message as setWordAndAnnotationsArrayArrayMessage;

        setWordsAnnotationWithAnnotationsArrayArray(currentAnnotation, nextAnnotation, annotationsArrayArray).then(
            (result) => {
                sendResponse(result);
            }
        );

        return true;
    }
}
