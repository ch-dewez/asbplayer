import { setWordsAnnotationWithSubtitles } from '@project/common/anki';
import { CommandHandler } from '../command-handler';
import { AddDictionnaryToTokenizerMessage, Command, Message, setWordAndSubtitlesMessage } from '@project/common';
import { Tokenizer } from '@project/common/japanese-tokenizer/tokenizer';

export default class AddDictionnaryToTokenizerHandler implements CommandHandler {
    readonly sender = 'asbplayerv2';
    readonly command = 'add-dictionnary-to-tokenizer';

    handle(
        command: Command<Message>,
        sender: chrome.runtime.MessageSender,
        sendResponse: (response?: any) => void
    ): boolean {
        const { text } = command.message as AddDictionnaryToTokenizerMessage;

        Tokenizer.loadDictionnaryFromString(text);
        console.log("dictionnary set");

        return false;
    }
}
