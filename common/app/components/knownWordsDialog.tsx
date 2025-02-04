import React, { useState } from 'react';
import DialogContent from '@material-ui/core/DialogContent';
import Dialog from '@material-ui/core/Dialog';
import TextField from '@material-ui/core/TextField/TextField';
import { Button } from '@material-ui/core';


interface Props {
    open: boolean;
    onClose: () => void;
}

export default function KnownWordsDialog({ open, onClose }: Props) {
    
    const [text, setText] = useState<string>('');

    const [knownWords, setKnownWords] = useState<string>('');

    function handleTextChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
        setText(e.target.value);
    }

    async function findKnownWords() {

        await chrome.runtime.sendMessage(
            {
                sender: 'asbplayer-extension-to-video',
                message: {
                    command: 'find-known-words',
                    text,
                },
            },
            (response) => {
                if (response.error) {
                    console.error(response.error);
                } else {
                    setKnownWords(response.knownWords.join(' '));
                }
            }
        );
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
                    label="find known words"
                    value={text}
                    onChange={handleTextChange}
                />
                <Button color='secondary' variant='contained' onClick={findKnownWords}>
                   find known words 
                </Button>
                <h4>
                    {knownWords}
                </h4>
            </DialogContent>
        </Dialog>
    )
}