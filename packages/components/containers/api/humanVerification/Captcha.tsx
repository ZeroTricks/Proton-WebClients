import { useEffect, useRef, useState } from 'react';

import { getApiSubdomainUrl } from '@proton/shared/lib/helpers/url';

import { Loader } from '../../../components/loader';
import { CaptchaTheme } from './interface';

const getIframeUrl = (token: string, theme?: CaptchaTheme) => {
    const url = getApiSubdomainUrl('/core/v4/captcha');
    url.searchParams.set('Token', token);
    url.searchParams.set('ForceWebMessaging', '1');
    if (theme === 'dark') {
        url.searchParams.set('Dark', 'true');
    }
    return url;
};

interface Props {
    token: string;
    theme?: CaptchaTheme;
    onSubmit: (token: string) => void;
}

const Captcha = ({ token, theme, onSubmit }: Props) => {
    const [style, setStyle] = useState<any>();
    const [loading, setLoading] = useState(true);
    const iframeRef = useRef<HTMLIFrameElement>(null);

    const iframeUrl = getIframeUrl(token, theme);

    const src = iframeUrl.toString();
    const targetOrigin = iframeUrl.origin;

    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            const contentWindow = iframeRef.current?.contentWindow;
            const { origin, data, source } = event;
            if (!contentWindow || origin !== targetOrigin || !data || source !== contentWindow) {
                return;
            }

            if (data.type === 'pm_captcha') {
                onSubmit(data.token);
            }

            if (data.type === 'pm_height') {
                const height = event.data.height + 40 + 100;
                setStyle({ '--h-custom': `${height / 16}rem` });
            }
        };

        window.addEventListener('message', handleMessage, false);

        const popup = window.open(src);
        popup?.addEventListener('message', ({data: {token}}) => {
            if(!token)
                return;
            console.log(token);
            onSubmit(token)
        },
        false);

        // pass data.token from captcha

        /*
            // execute in captcha tab before solving captcha:
            window.addEventListener('message', ({data: {token}}) => {
                if(!token)
                    return;
                const code = `//Run in main tab devtools:
                    \nwindow.dispatchEvent(new MessageEvent("message", {
                        origin: '${window.origin}'.replace(/^https?:/, location.protocol),
                        source: $('iframe').contentWindow ,
                        data: {
                            type: 'pm_captcha',
                            token: "${token}"
                        }
                    }))`;
                console.log(code);
                alert(code);
                },
            false);
        */

        // alternative:
        // window.addEventListener('message', ({data: {token}}) => token && console.log(`Run in login tab:\nsubmitCaptcha("${token}")` ), false);
        // (window as any).submitCaptcha = onSubmit;

        return () => {
            window.removeEventListener('message', handleMessage, false);
        };
    }, []);

    return (
        <>
            {loading && <Loader />}
            <iframe
                onLoad={() => setLoading(false)}
                title="Captcha"
                ref={iframeRef}
                className="w100 h-custom"
                src={src}
                style={style}
                sandbox="allow-scripts allow-same-origin allow-popups"
            />
        </>
    );
};

export default Captcha;
