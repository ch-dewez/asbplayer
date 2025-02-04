import React, { useState } from 'react';
import DialogContent from '@material-ui/core/DialogContent';
import Dialog from '@material-ui/core/Dialog';
import TextField from '@material-ui/core/TextField/TextField';
import { Button } from '@material-ui/core';
import { getBasicFormFromText } from '@project/common/japanese-tokenizer/tokenizer';


interface Props {
    open: boolean;
    onClose: () => void;
}

export default function TokenizerDialog({ open, onClose }: Props) {
    
    const [text, setText] = useState<string>('');

    const [tokenizeText, setTokenizeText] = useState<string>('');

    function handleTextChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
        setText(e.target.value);
    }

    async function tokenize() {

        let basic_form = await getBasicFormFromText(text)
        let sentence = basic_form.join(' ')
        setTokenizeText(sentence)
    }

    return (
        <Dialog open={open} maxWidth="md" fullWidth onClose={onClose}>
            <DialogContent>

                <TextField
                    variant="filled"
                    color="secondary"
                    multiline
                    fullWidth
                    maxRows={8}
                    label="Japanese tokenizer"
                    value={text}
                    onChange={handleTextChange}
                />
                <Button color='secondary' variant='contained' onClick={tokenize}>
                    Tokenize
                </Button>
                <h4>
                    {tokenizeText}
                </h4>
            </DialogContent>
        </Dialog>
    )
}