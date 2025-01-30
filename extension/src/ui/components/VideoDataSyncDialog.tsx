import Button from '@material-ui/core/Button';
import CircularProgress from '@material-ui/core/CircularProgress';
import CloseIcon from '@material-ui/icons/Close';
import Dialog from '@material-ui/core/Dialog';
import DialogActions from '@material-ui/core/DialogActions';
import DialogContent from '@material-ui/core/DialogContent';
import DialogContentText from '@material-ui/core/DialogContentText';
import Grid from '@material-ui/core/Grid';
import IconButton from '@material-ui/core/IconButton';
import SettingsIcon from '@material-ui/icons/Settings';
import MenuItem from '@material-ui/core/MenuItem';
import TextField from '@material-ui/core/TextField';
import Toolbar from '@material-ui/core/Toolbar';
import Typography from '@material-ui/core/Typography';
import makeStyles from '@material-ui/styles/makeStyles';
import Switch from '@material-ui/core/Switch';
import LabelWithHoverEffect from '@project/common/components/LabelWithHoverEffect';
import { ConfirmedVideoDataSubtitleTrack, VideoDataSubtitleTrack, VideoDataUiOpenReason } from '@project/common';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import MiniProfileSelector from '@project/common/components/MiniProfileSelector';
import type { Profile } from '@project/common/settings';

const createClasses = makeStyles((theme) => ({
    relative: {
        position: 'relative',
    },
    spinner: {
        position: 'absolute',
        right: 'calc(1em + 14px)',
        top: 'calc(50% - 13px)',
        fontSize: '1.5em',
    },
    hide: {
        display: 'none',
    },
}));

// An auto-calculated video name based on selected track
function calculateVideoName(baseName: string, label: string, localFile: boolean | undefined) {
    if (baseName === '' && label) {
        return label;
    }

    if (label && localFile !== true) {
        return `${baseName} - ${label}`;
    }

    return baseName;
}

interface Props {
    open: boolean;
    disabled: boolean;
    isLoading: boolean;
    // The video name automatically supplied by asbplayer's content script
    // Not to be confused with the auto-calculated video name when user selects a subtitle track
    suggestedName: string;
    showSubSelect: boolean;
    subtitleTracks: VideoDataSubtitleTrack[];
    selectedSubtitleTrackIds: string[];
    defaultCheckboxState: boolean;
    error: string;
    openReason: VideoDataUiOpenReason;
    profiles: Profile[];
    activeProfile?: string;
    onCancel: () => void;
    onOpenFile: (track?: number) => void;
    onOpenSettings: () => void;
    onConfirm: (track: ConfirmedVideoDataSubtitleTrack[], shouldRememberTrackChoices: boolean) => void;
    onSetActiveProfile: (profile: string | undefined) => void;
}

export default function VideoDataSyncDialog({
    open,
    disabled,
    isLoading,
    suggestedName,
    showSubSelect,
    subtitleTracks,
    selectedSubtitleTrackIds,
    defaultCheckboxState,
    error,
    openReason,
    profiles,
    activeProfile,
    onCancel,
    onOpenFile,
    onOpenSettings,
    onConfirm,
    onSetActiveProfile,
}: Props) {
    const { t } = useTranslation();
    const [userSelectedSubtitleTrackIds, setUserSelectedSubtitleTrackIds] = useState(['-', '-', '-']);
    const [name, setName] = useState('');
    const [shouldRememberTrackChoices, setShouldRememberTrackChoices] = React.useState(false);
    const trimmedName = name.trim();
    const classes = createClasses();

    useEffect(() => {
        if (open) {
            setUserSelectedSubtitleTrackIds(
                selectedSubtitleTrackIds.map((id) => {
                    return id !== undefined ? id : '-';
                })
            );
        } else if (!open) {
            setName('');
        }
    }, [open, selectedSubtitleTrackIds]);

    useEffect(() => {
        if (open) {
            setShouldRememberTrackChoices(defaultCheckboxState);
        }
    }, [open, defaultCheckboxState]);

    useEffect(() => {
        setName((name) => {
            if (!subtitleTracks) {
                // Unable to calculate the video name
                return name;
            }

            // If the video name is not calculated yet,
            // or has already been calculated and not changed by the user,
            // then calculate it (possibly again)
            if (
                !name ||
                name === suggestedName ||
                subtitleTracks.find(
                    (track) =>
                        track.url !== '-' && name === calculateVideoName(suggestedName, track.label, track.localFile)
                )
            ) {
                const selectedTrack = subtitleTracks.find((track) => track.id === userSelectedSubtitleTrackIds[0]);

                if (selectedTrack === undefined || selectedTrack.url === '-') {
                    return suggestedName;
                }

                return calculateVideoName(suggestedName, selectedTrack.label, selectedTrack.localFile);
            }

            // Otherwise, let the name be whatever the user set it to
            return name;
        });
    }, [suggestedName, userSelectedSubtitleTrackIds, subtitleTracks]);

    function handleOkButtonClick() {
        const selectedSubtitleTracks: ConfirmedVideoDataSubtitleTrack[] = allSelectedSubtitleTracks();
        onConfirm(selectedSubtitleTracks, shouldRememberTrackChoices);
    }

    function handleRememberTrackChoices() {
        setShouldRememberTrackChoices(!shouldRememberTrackChoices);
    }

    function allSelectedSubtitleTracks() {
        const selectedSubtitleTracks: ConfirmedVideoDataSubtitleTrack[] = userSelectedSubtitleTrackIds
            .map((selected): ConfirmedVideoDataSubtitleTrack | undefined => {
                const subtitle = subtitleTracks.find((subtitle) => subtitle.id === selected);
                if (subtitle) {
                    const { localFile, label } = subtitle;
                    const trackName = localFile
                        ? // Remove extension. The content script will add it back when rendering the file name on top of the video.
                          label.substring(0, label.lastIndexOf('.'))
                        : calculateVideoName(trimmedName, label, localFile);

                    return {
                        name: trackName,
                        ...subtitle,
                    };
                }
            })
            .filter((track): track is ConfirmedVideoDataSubtitleTrack => track !== undefined);

        return selectedSubtitleTracks;
    }

    function generateSubtitleTrackSelectors(numberOfSubtitleTrackSelectors: number) {
        const subtitleTrackSelectors = [];
        for (let i = 0; i < numberOfSubtitleTrackSelectors; i++) {
            subtitleTrackSelectors.push(
                <Grid item key={i} style={{ width: '100%' }}>
                    <div className={`${classes.relative}${!showSubSelect ? ` ${classes.hide}` : ''}`}>
                        <TextField
                            select
                            fullWidth
                            key={i}
                            error={!!error}
                            color="secondary"
                            variant="filled"
                            label={`${t('extension.videoDataSync.subtitleTrack')} ${i + 1}`}
                            helperText={error || ''}
                            value={
                                subtitleTracks.find((track) => track.id === userSelectedSubtitleTrackIds[i])?.id ?? '-'
                            }
                            disabled={isLoading || disabled}
                            onChange={(e) =>
                                setUserSelectedSubtitleTrackIds((prevSelectedSubtitles) => {
                                    const newSelectedSubtitles = [...prevSelectedSubtitles];
                                    newSelectedSubtitles[i] = e.target.value;
                                    return newSelectedSubtitles;
                                })
                            }
                        >
                            {subtitleTracks.map((subtitle) => (
                                <MenuItem value={subtitle.id} key={subtitle.id}>
                                    {subtitle.label}
                                </MenuItem>
                            ))}
                            <MenuItem onClick={() => onOpenFile(i)}>{t('action.openFiles')}</MenuItem>
                        </TextField>
                        {isLoading && (
                            <span className={classes.spinner}>
                                <CircularProgress size={20} color="secondary" />
                            </span>
                        )}
                    </div>
                </Grid>
            );
        }
        return subtitleTrackSelectors;
    }

    const threeSubtitleTrackSelectors = generateSubtitleTrackSelectors(3);

    const okButtonRef = useRef<HTMLButtonElement | null>(null);

    useEffect(() => {
        if (open && trimmedName && !disabled) {
            okButtonRef.current?.focus();
        }
    }, [open, trimmedName, disabled]);

    return (
        <Dialog disableRestoreFocus disableEnforceFocus fullWidth maxWidth="sm" open={open} onClose={onCancel}>
            <Toolbar>
                <Typography variant="h6" style={{ flexGrow: 1 }}>
                    {t('extension.videoDataSync.selectSubtitles')}
                </Typography>
                <MiniProfileSelector
                    profiles={profiles}
                    activeProfile={activeProfile}
                    onSetActiveProfile={onSetActiveProfile}
                />
                {onOpenSettings && (
                    <IconButton edge="end" onClick={onOpenSettings}>
                        <SettingsIcon />
                    </IconButton>
                )}
                {onCancel && (
                    <IconButton edge="end" onClick={() => onCancel()}>
                        <CloseIcon />
                    </IconButton>
                )}
            </Toolbar>
            <DialogContent>
                {openReason === VideoDataUiOpenReason.miningCommand && (
                    <DialogContentText>{t('extension.videoDataSync.loadSubtitlesFirst')}</DialogContentText>
                )}
                {openReason === VideoDataUiOpenReason.failedToAutoLoadPreferredTrack && (
                    <DialogContentText>{t('extension.videoDataSync.failedToAutoLoad')}</DialogContentText>
                )}
                <form>
                    <Grid container direction="column" spacing={2}>
                        <Grid item>
                            <TextField
                                fullWidth
                                multiline
                                color="secondary"
                                variant="filled"
                                label={t('extension.videoDataSync.videoName')}
                                value={name}
                                disabled={disabled}
                                onChange={(e) => setName(e.target.value)}
                            />
                        </Grid>
                        {threeSubtitleTrackSelectors}
                        <Grid item>
                            <LabelWithHoverEffect
                                control={
                                    <Switch
                                        checked={shouldRememberTrackChoices}
                                        onChange={handleRememberTrackChoices}
                                        color="secondary"
                                    />
                                }
                                label={t('extension.videoDataSync.rememberTrackPreference')}
                                labelPlacement="start"
                                style={{
                                    display: 'flex',
                                    marginLeft: 'auto',
                                    marginRight: '-13px',
                                    width: 'fit-content',
                                }}
                            />
                        </Grid>
                    </Grid>
                </form>
            </DialogContent>
            <DialogActions>
                <Button disabled={disabled} onClick={() => onOpenFile()}>
                    {t('action.openFiles')}
                </Button>
                <Button ref={okButtonRef} disabled={!trimmedName || disabled} onClick={handleOkButtonClick}>
                    {t('action.ok')}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
