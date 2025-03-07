import { CommandHandler } from '../command-handler';
import { TokenizeTextMessage, Command, Message, setWordAndSubtitlesMessage } from '@project/common';
import { Tokenizer } from '@project/common/japanese-tokenizer/tokenizer';

export default class tokenizerTextHandler implements CommandHandler {
    readonly sender = 'asbplayerv2';
    readonly command = 'tokenize-text';

    handle(
        command: Command<Message>,
        sender: chrome.runtime.MessageSender,
        sendResponse: (response?: any) => void
    ): boolean {
        const { text } = command.message as TokenizeTextMessage;

        Tokenizer.tokenizeText(text)
        .then((result) => {
            console.log(result);
            sendResponse(result);
        });

        return true;
    }
}
