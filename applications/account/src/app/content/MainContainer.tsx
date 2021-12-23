import { lazy, Suspense, useEffect, useState } from 'react';
import { c } from 'ttag';
import { Route, Redirect, Switch, useLocation } from 'react-router-dom';
import { DEFAULT_APP, getAppFromPathnameSafe, getSlugFromApp } from '@proton/shared/lib/apps/slugHelper';
import { APPS } from '@proton/shared/lib/constants';

import {
    useActiveBreakpoint,
    useToggle,
    PrivateHeader,
    PrivateAppContainer,
    Logo,
    useUser,
    useFeatures,
    FeatureCode,
} from '@proton/components';

import { UserModel } from '@proton/shared/lib/interfaces';
import PrivateMainAreaLoading from '../components/PrivateMainAreaLoading';

import AccountSidebar from './AccountSidebar';
import AccountDashboardSettings, { hasAccountDashboardPage } from '../containers/account/AccountDashboardSettings';
import AccountSecuritySettings from '../containers/account/AccountSecuritySettings';
import AccountRecoverySettings, { hasRecoverySettings } from '../containers/account/AccountRecoverySettings';
import AccountAccountAndPasswordSettings from '../containers/account/AccountAccountAndPasswordSettings';
import AccountLanguageAndTimeSettings from '../containers/account/AccountLanguageAndTimeSettings';
import AccountEasySwitchSettings from '../containers/account/AccountEasySwitchSettings';
import OrganizationMultiUserSupportSettings from '../containers/organization/OrganizationMultiUserSupportSettings';
import OrganizationUsersAndAddressesSettings from '../containers/organization/OrganizationUsersAndAddressesSettings';
import OrganizationKeysSettings from '../containers/organization/OrganizationKeysSettings';
import MailDomainNamesSettings from '../containers/mail/MailDomainNamesSettings';

const MailSettingsRouter = lazy(() => import('../containers/mail/MailSettingsRouter'));
const CalendarSettingsRouter = lazy(() => import('../containers/calendar/CalendarSettingsRouter'));
const ContactsSettingsRouter = lazy(() => import('../containers/contacts/ContactsSettingsRouter'));
const VpnSettingsRouter = lazy(() => import('../containers/vpn/VpnSettingsRouter'));
const DriveSettingsRouter = lazy(() => import('../containers/drive/DriveSettingsRouter'));

const mailSlug = getSlugFromApp(APPS.PROTONMAIL);
const calendarSlug = getSlugFromApp(APPS.PROTONCALENDAR);
const vpnSlug = getSlugFromApp(APPS.PROTONVPN_SETTINGS);
const driveSlug = getSlugFromApp(APPS.PROTONDRIVE);
const contactsSlug = getSlugFromApp(APPS.PROTONCONTACTS);

const getDefaultRedirect = (user: UserModel) => {
    if (hasAccountDashboardPage(user)) {
        return '/dashboard';
    }

    if (hasRecoverySettings(user)) {
        return '/recovery';
    }

    return '/account-password';
};

const MainContainer = () => {
    const [user] = useUser();
    const location = useLocation();
    const { state: expanded, toggle: onToggleExpand, set: setExpand } = useToggle();
    const { isNarrow } = useActiveBreakpoint();
    const [isBlurred] = useState(false);

    const features = useFeatures([
        FeatureCode.CalendarEmailNotification,
        FeatureCode.CalendarSubscription,
        FeatureCode.CalendarInviteLocale,
    ]);
    const loadingFeatures = features.some(({ loading }) => loading);

    useEffect(() => {
        setExpand(false);
    }, [location.pathname, location.hash]);

    const app = getAppFromPathnameSafe(location.pathname);

    
    if (!app) {
        return <Redirect to={`/${getSlugFromApp(DEFAULT_APP)}${getDefaultRedirect(user)}`} />;
    }

    const appSlug = getSlugFromApp(app);

    const redirect = `/${appSlug}${getDefaultRedirect(user)}`;

    /*
     * There's no logical app to return/go to from VPN settings since the
     * vpn web app is also settings which you are already in. Redirect to
     * the default path in account in that case.
     */
    const isVpn = app === APPS.PROTONVPN_SETTINGS;
    const toApp = isVpn ? APPS.PROTONACCOUNT : app;
    const to = isVpn ? '/vpn' : '/';

    const logo = <Logo appName={app} to={to} toApp={toApp} target="_self" />;

    const header = (
        <PrivateHeader
            logo={logo}
            title={c('Title').t`Settings`}
            expanded={expanded}
            onToggleExpand={onToggleExpand}
            isNarrow={isNarrow}
        />
    );

    const sidebar = (
        <AccountSidebar app={app} appSlug={appSlug} logo={logo} expanded={expanded} onToggleExpand={onToggleExpand} />
    );

    return (
        <PrivateAppContainer header={header} sidebar={sidebar} isBlurred={isBlurred}>
            <Switch>
                {hasAccountDashboardPage(user) && (
                    <Route path={`/${appSlug}/dashboard`}>
                        <AccountDashboardSettings location={location} setActiveSection={() => {}} />
                    </Route>
                )}
                {hasRecoverySettings(user) && (
                    <Route path={`/${appSlug}/recovery`}>
                        <AccountRecoverySettings location={location} setActiveSection={() => {}} />
                    </Route>
                )}
                <Route path={`/${appSlug}/account-password`}>
                    <AccountAccountAndPasswordSettings location={location} setActiveSection={() => {}} />
                </Route>
                <Route path={`/${appSlug}/language-time`}>
                    <AccountLanguageAndTimeSettings location={location} setActiveSection={() => {}} />
                </Route>
                <Route path={`/${appSlug}/easy-switch`}>
                    <AccountEasySwitchSettings location={location} setActiveSection={() => {}} />
                </Route>
                <Route path={`/${appSlug}/security`}>
                    <AccountSecuritySettings location={location} setActiveSection={() => {}} />
                </Route>
                <Route path={`/${appSlug}/multi-user-support`}>
                    <OrganizationMultiUserSupportSettings location={location} />
                </Route>
                <Route path={`/${appSlug}/domain-names`}>
                    <MailDomainNamesSettings location={location} />
                </Route>
                <Route path={`/${appSlug}/organization-keys`}>
                    <OrganizationKeysSettings location={location} />
                </Route>
                <Route path={`/${appSlug}/users-addresses`}>
                    <OrganizationUsersAndAddressesSettings location={location} />
                </Route>
                <Route path={`/${mailSlug}`}>
                    <Suspense fallback={<PrivateMainAreaLoading />}>
                        <MailSettingsRouter redirect={redirect} />
                    </Suspense>
                </Route>
                <Route path={`/${calendarSlug}`}>
                    <Suspense fallback={<PrivateMainAreaLoading />}>
                        <CalendarSettingsRouter redirect={redirect} user={user} loadingFeatures={loadingFeatures} />
                    </Suspense>
                </Route>
                <Route path={`/${contactsSlug}`}>
                    <Suspense fallback={<PrivateMainAreaLoading />}>
                        <ContactsSettingsRouter redirect={redirect} />
                    </Suspense>
                </Route>
                <Route path={`/${vpnSlug}`}>
                    <Suspense fallback={<PrivateMainAreaLoading />}>
                        <VpnSettingsRouter redirect={redirect} />
                    </Suspense>
                </Route>
                <Route path={`/${driveSlug}`}>
                    <Suspense fallback={<PrivateMainAreaLoading />}>
                        <DriveSettingsRouter redirect={redirect} />
                    </Suspense>
                </Route>
                <Redirect to={redirect} />
            </Switch>
        </PrivateAppContainer>
    );
};

export default MainContainer;
