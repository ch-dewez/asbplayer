import React from 'react';
import { Trans } from 'react-i18next';
import { makeStyles } from '@material-ui/styles';
import gt from 'semver/functions/gt';
import Fade from '@material-ui/core/Fade';
import Paper from '@material-ui/core/Paper';
import Link from '@material-ui/core/Link';
import Typography from '@material-ui/core/Typography';
import ChromeExtension from '../services/chrome-extension';
import { Theme } from '@material-ui/core/styles';
import { useAppBarHeight } from '../hooks/use-app-bar-height';
import { VideoTabModel } from '../..';
import VideoElementSelector from './VideoElementSelector';

interface StylesProps {
    appBarHidden: boolean;
    appBarHeight: number;
}

const useStyles = makeStyles<Theme, StylesProps>((theme) => ({
    background: ({ appBarHidden, appBarHeight }) => ({
        position: 'absolute',
        height: appBarHidden ? '100vh' : `calc(100vh - ${appBarHeight}px)`,
        width: '100%',
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 15,
        textAlign: 'center',
    }),
    browseLink: {
        cursor: 'pointer',
    },
    videoElementSelectorContainer: {
        position: 'absolute',
        bottom: 0,
        padding: theme.spacing(2),
        width: '100%',
    },
}));

interface Props {
    extension: ChromeExtension;
    latestExtensionVersion: string;
    extensionUrl: string;
    loading: boolean;
    dragging: boolean;
    appBarHidden: boolean;
    videoElements: VideoTabModel[];
    onFileSelector: React.MouseEventHandler<HTMLAnchorElement> &
        React.MouseEventHandler<HTMLSpanElement> &
        React.MouseEventHandler<HTMLLabelElement>;
    onVideoElementSelected: (videoElement: VideoTabModel) => void;
}

export default function LandingPage({
    extension,
    latestExtensionVersion,
    extensionUrl,
    loading,
    dragging,
    appBarHidden,
    videoElements,
    onFileSelector,
    onVideoElementSelected,
}: Props) {
    const appBarHeight = useAppBarHeight();
    const classes = useStyles({ appBarHidden, appBarHeight });
    const extensionUpdateAvailable = extension.version && gt(latestExtensionVersion, extension.version);

    return (
        <Paper square variant="elevation" elevation={0} className={classes.background}>
            <Fade in={!loading && !dragging} timeout={500}>
                <>
                    <Typography variant="h6">
                        <Trans i18nKey={'landing.cta'}>
                            Drag and drop subtitle and media files, or
                            <Link
                                target="#"
                                className={classes.browseLink}
                                onClick={onFileSelector}
                                color="secondary"
                                component="label"
                            >
                                browse
                            </Link>
                            .
                        </Trans>
                        <br />
                        {!extension.installed && (
                            <Trans i18nKey="landing.extensionNotInstalled">
                                Install the
                                <Link color="secondary" target="_blank" rel="noreferrer" href={extensionUrl}>
                                    Chrome extension
                                </Link>
                                to sync subtitles with streaming video.
                            </Trans>
                        )}
                        {extensionUpdateAvailable && (
                            <Trans i18nKey="landing.extensionUpdateAvailable">
                                An extension
                                <Link color="secondary" target="_blank" rel="noreferrer" href={extensionUrl}>
                                    update
                                </Link>{' '}
                                is available.
                            </Trans>
                        )}
                    </Typography>
                    {extension.supportsLandingPageStreamingVideoElementSelector && videoElements.length > 0 && (
                        <div className={classes.videoElementSelectorContainer}>
                            <VideoElementSelector
                                videoElements={videoElements}
                                onVideoElementSelected={onVideoElementSelected}
                            />
                        </div>
                    )}
                </>
            </Fade>
        </Paper>
    );
}
