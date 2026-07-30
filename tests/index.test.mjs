import assert from 'node:assert/strict';
import test from 'node:test';

test('initializes once and reflects the active chat', async (t) => {
    const eventTypes = {
        APP_INITIALIZED: 'app_initialized',
        CHAT_CHANGED: 'chat_changed',
    };

    const handlers = new Map();

    let activeChatId = null;
    let panel = null;
    let templateRenderCount = 0;
    let panelInsertCount = 0;

    const noChatState = {
        hidden: false,
    };

    const emptyChatState = {
        hidden: true,
    };

    const settingsContainer = {
        insertAdjacentHTML(position, html) {
            assert.equal(position, 'beforeend');
            assert.match(html, /chromatic-dialogue-settings/);

            panelInsertCount += 1;

            panel = {
                dataset: {},
                querySelector(selector) {
                    if (selector === '#chromatic-dialogue-no-chat') {
                        return noChatState;
                    }

                    if (selector === '#chromatic-dialogue-empty-state') {
                        return emptyChatState;
                    }

                    return null;
                },
            };
        },
    };

    const originalDocument = globalThis.document;
    const originalSillyTavern = globalThis.SillyTavern;

    t.after(() => {
        if (originalDocument === undefined) {
            delete globalThis.document;
        } else {
            globalThis.document = originalDocument;
        }

        if (originalSillyTavern === undefined) {
            delete globalThis.SillyTavern;
        } else {
            globalThis.SillyTavern = originalSillyTavern;
        }
    });

    globalThis.document = {
        getElementById(id) {
            if (id === 'extensions_settings2') {
                return settingsContainer;
            }

            if (id === 'chromatic-dialogue-settings') {
                return panel;
            }

            return null;
        },
    };

    const context = {
        eventTypes,

        eventSource: {
            on(type, handler) {
                const eventHandlers = handlers.get(type) ?? [];

                eventHandlers.push(handler);
                handlers.set(type, eventHandlers);
            },
        },

        get chatId() {
            return activeChatId;
        },

        async renderExtensionTemplateAsync(folder, template) {
            assert.equal(
                folder,
                'third-party/SillyTavern-ChromaticDialogue',
            );
            assert.equal(template, 'settings');

            templateRenderCount += 1;
            await Promise.resolve();

            return '<div id="chromatic-dialogue-settings"></div>';
        },
    };

    globalThis.SillyTavern = {
        getContext() {
            return context;
        },
    };

    const moduleUrl = new URL(
        `../index.js?lifecycle-test=${Date.now()}`,
        import.meta.url,
    );

    const { onActivate } = await import(moduleUrl);

    onActivate();
    onActivate();

    const appInitializedHandlers =
        handlers.get(eventTypes.APP_INITIALIZED) ?? [];

    assert.equal(appInitializedHandlers.length, 1);

    await Promise.all([
        appInitializedHandlers[0](),
        appInitializedHandlers[0](),
        appInitializedHandlers[0](),
    ]);

    const chatChangedHandlers = handlers.get(eventTypes.CHAT_CHANGED) ?? [];

    assert.equal(templateRenderCount, 1);
    assert.equal(panelInsertCount, 1);
    assert.equal(chatChangedHandlers.length, 1);

    assert.equal(panel.dataset.chatState, 'none');
    assert.equal(noChatState.hidden, false);
    assert.equal(emptyChatState.hidden, true);

    await appInitializedHandlers[0]();

    assert.equal(templateRenderCount, 1);
    assert.equal(panelInsertCount, 1);
    assert.equal(handlers.get(eventTypes.CHAT_CHANGED)?.length, 1);

    activeChatId = 'Example chat';
    await chatChangedHandlers[0]();

    assert.equal(panel.dataset.chatState, 'active');
    assert.equal(noChatState.hidden, true);
    assert.equal(emptyChatState.hidden, false);

    activeChatId = '   ';
    await chatChangedHandlers[0]();

    assert.equal(panel.dataset.chatState, 'none');
    assert.equal(noChatState.hidden, false);
    assert.equal(emptyChatState.hidden, true);
});
