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

        // ways to submit captcha token

        // 1) manually pass token from popup to login tab
        const workingSrc = src.replace(/^https?:\/\/.*?(?=\/)/, 'https://mail-api.proton.me');
        const popup = window.open(workingSrc);
        (window as any).submitCaptcha = (token:string) => {
            popup?.close();
            onSubmit(token);
        };
        alert(`Execute in captcha devtools before solving captcha:
            \nwindow.addEventListener('message', ({data: {token}}) => token && token.length > 64 && alert(\`Run in login tab:\\n\\nsubmitCaptcha("\${token}")\` ), false);`
        );

        // 2) listen to captcha event in popup;
        //  - doesn't work in cross origin
        // popup?.addEventListener('message', ({data: {token}}) => {
        //     if(!token)
        //         return;
        //     console.log(token);
        //     onSubmit(token)
        // },
        // false);

        // 3) manually pass message from popup to main tab
        //  - requires no hacks
        //  - doesn't work with puzzle
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
