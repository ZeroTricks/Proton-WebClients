import { contentScriptMessage, sendMessage } from '@proton/pass/extension/message';
import type { FormEntry, PromptedFormEntry, WithAutoSavePromptOptions } from '@proton/pass/types';
import { FormEntryStatus, WorkerMessageType } from '@proton/pass/types';
import { createListenerStore } from '@proton/pass/utils/listener';
import { logger } from '@proton/pass/utils/logger';
import debounce from '@proton/utils/debounce';

import { isSubmissionCommitted } from '../../../shared/form';
import { withContext } from '../../context/context';
import type { FormHandle } from '../../types';
import { NotificationAction } from '../../types';
import { setFormProcessed } from '../../utils/nodes';
import { createFormHandles } from '../handles/form';

type FormManagerOptions = { onDetection: (forms: FormHandle[]) => void };

export type FormManagerContext = {
    /* form manager state flag */
    active: boolean;
    /* ongoing detection flag */
    busy: boolean;
    /* detection request */
    detectionRequest: number;
    /* tracked forms have been detected */
    trackedForms: Map<HTMLElement, FormHandle>;
};

export const createFormManager = (options: FormManagerOptions) => {
    const ctx: FormManagerContext = {
        active: false,
        busy: false,
        detectionRequest: -1,
        trackedForms: new Map(),
    };

    const listeners = createListenerStore();
    const getTrackedForms = () => Array.from(ctx.trackedForms.values());

    /* FIXME: if no autosave.prompt setting we should avoid
     * setting any listeners at all for form submissions */
    const onCommittedSubmission: (submission: WithAutoSavePromptOptions<FormEntry<FormEntryStatus.COMMITTED>>) => void =
        withContext(({ getSettings, service: { iframe } }, submission) => {
            const shouldPrompt = getSettings().autosave.prompt && submission.autosave.shouldPrompt;

            if (shouldPrompt) {
                iframe.attachNotification();
                iframe.notification?.open({
                    action: NotificationAction.AUTOSAVE_PROMPT,
                    submission: submission as PromptedFormEntry,
                });
            }
        });

    /* Reconciliation is responsible for syncing the service
     * worker state with our local detection in order to take
     * the appropriate action for auto-save */
    const reconciliate: () => Promise<void> = withContext(async ({ getExtensionContext, service: { iframe } }) => {
        const submission = await sendMessage.on(
            contentScriptMessage({ type: WorkerMessageType.FORM_ENTRY_REQUEST }),
            (response) => (response.type === 'success' ? response.submission : undefined)
        );

        if (submission !== undefined) {
            const { status, partial, domain, type } = submission;
            const currentDomain = getExtensionContext().url.domain;
            const formRemoved = !ctx.trackedForms.some(({ formType }) => formType === type);

            const domainmatch = currentDomain === domain;
            const canCommit = domainmatch && formRemoved;

            /* if we have a non-partial staging form submission at
             * this stage either commit it if no forms of the same
             * type are present in the DOM - or stash it if it's the
             * case : we may be dealing with a failed login */
            if (status === FormEntryStatus.STAGING && !partial && canCommit) {
                return sendMessage.onSuccess(
                    contentScriptMessage({
                        type: WorkerMessageType.FORM_ENTRY_COMMIT,
                        payload: { reason: 'FORM_TYPE_REMOVED' },
                    }),
                    ({ committed }) => committed !== undefined && onCommittedSubmission(committed)
                );
            }

            if (isSubmissionCommitted(submission) && formRemoved) return onCommittedSubmission(submission);

            if (!formRemoved) {
                void sendMessage(
                    contentScriptMessage({
                        type: WorkerMessageType.FORM_ENTRY_STASH,
                        payload: { reason: 'FORM_TYPE_PRESENT' },
                    })
                );
            }
        }

        iframe.detachNotification();
    });

    const detachTrackedForm = (formEl: HTMLElement) => {
        ctx.trackedForms.get(formEl)?.detach();
        ctx.trackedForms.delete(formEl);
    };

    /* Garbage collection is used to detach tracked forms
     * if they have been removed from the DOM - this may be the case
     * in SPA apps. Once a form is detected, it will be tracked until
     * removed : form visibility changes have no effect on detachment
     * for performance reasons (costly `isVisible` check) */
    const garbagecollect = () => {
        ctx.trackedForms.forEach((form) => {
            return form.shouldRemove() && detachTrackedForm(form.element);
        });
    };

    /* Detection :
     * - runs in `requestAnimationFrame` to defer costly DOM operations
     * - if a stale form has been detected: unsubscribe
     * - on each detected form: recycle/create form handle and reconciliate
     *   its fields */
    const detect = debounce(
        withContext<(reason: string) => Promise<any>>(async ({ service: { detector } }, reason: string) => {
            if (ctx.busy || !ctx.active) return;
            ctx.busy = true;
            garbagecollect();

            if (await detector.shouldRunDetection()) {
                cancelAnimationFrame(ctx.detectionRequest);
                return (ctx.detectionRequest = requestAnimationFrame(() => {
                    if (ctx.active) {
                        logger.info(`[FormTracker::Detector]: Running detection for "${reason}"`);
                        const forms = detector.runDetection();

                        forms.forEach((options) => {
                            setFormProcessed(options.form, options.formType);
                            const formHandle = ctx.trackedForms.get(options.form) ?? createFormHandles(options);
                            ctx.trackedForms.set(options.form, formHandle);
                            formHandle.reconciliate(options.fields);
                            formHandle.attach();
                        });

                        options.onDetection(getTrackedForms());
                        void reconciliate();
                        ctx.busy = false;
                    }
                }));
            }

            return (ctx.busy = false);
        }),
        250,
        { leading: true }
    );

    /* As we're listening for mutations on the whole DOM tree : only process
     * the mutations of interests : new or deleted input fields or mutation
     * changes in target elements containing input fields. This heuristic should
     * be fine-tuned to avoid missing-out on mutations of interest  */
    const onMutation = (mutations: MutationRecord[]) => {
        const triggerFormChange = mutations.some((mutation) => {
            const newNodes = Array.from(mutation.addedNodes);
            const deletedNodes = Array.from(mutation.removedNodes);
            const target = mutation.target as HTMLElement;

            return (
                newNodes.some((node) => node instanceof HTMLInputElement) ||
                deletedNodes.some((node) => node instanceof HTMLInputElement) ||
                target.querySelector('input') !== null
            );
        });

        if (triggerFormChange) void detect('DomMutation');
    };

    /* When watching transitions on the `document.body` we are only interested
     * in untracked form elements being transitioned. If a form is tracked, we
     * rely on its internal form tracker to watch for changes */
    const onTransition = (event: Event) => {
        if (event.target instanceof HTMLFormElement && !ctx.trackedForms.has(event.target)) {
            requestAnimationFrame(() => setTimeout(() => detect('FormTransition'), 1000));
        }
    };

    /* the mutation observer in this call will only watch for changes
     * on the body subtree - this will not catch attribute changes on
     * elements : we rely on a different mechanism to  detect these
     * changes (ie: visibility or style changes - the detectors will only
     * try to match visible forms for performance reasons) */
    const observe = () => {
        if (!ctx.active) {
            ctx.active = true;
            listeners.addObserver(document.body, onMutation, { childList: true, subtree: true });
            listeners.addListener(document, 'animationend', onTransition);
            listeners.addListener(document, 'transitionend', onTransition);
        }
    };

    const destroy = () => {
        ctx.active = false;
        ctx.busy = false;

        cancelAnimationFrame(ctx.detectionRequest);
        detect.cancel();
        listeners.removeAll();

        ctx.trackedForms.forEach((form) => detachTrackedForm(form.element));
        ctx.trackedForms.clear();
    };

    const sync = () => ctx.trackedForms.forEach((form) => form.tracker?.reconciliate());

    return {
        getTrackedForms,
        observe,
        detect,
        sync,
        destroy,
        reconciliate,
    };
};

export type FormManager = ReturnType<typeof createFormManager>;
