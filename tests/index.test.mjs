import assert from 'node:assert/strict';
import test from 'node:test';
import {
    CHAT_METADATA_KEY,
    GENERATED_STYLE_ID,
} from '../src/constants.js';
import {
    getPendingReview,
    clearAllPendingReviews,
} from '../src/pending-review-store.js';

test('registers once and synchronizes repeated active-chat changes', async (t) => {
    clearAllPendingReviews();

    const eventTypes = {
        APP_INITIALIZED: 'app_initialized',
        CHAT_CHANGED: 'chat_changed',
        MESSAGE_RECEIVED: 'message_received',
    };

    const handlers = new Map();

    let activeChatId = null;
    let activeChatMetadata = {};
    let activeChat = [];
    let saveMetadataCalled = false;
    let panel = null;
    let templateRenderCount = 0;
    let panelInsertCount = 0;
    let generatedStyle = null;
    let styleAppendCount = 0;

    const noChatState = {
        hidden: false,
    };

    const emptyChatState = {
        hidden: true,
    };

    const assignmentList = {
        hidden: true,
        children: [],

        replaceChildren(...children) {
            this.children = children;
        },
    };

    const assignmentFormFieldset = {
        disabled: true,
    };

    function createMockElement(tagName) {
        return {
            tagName: tagName.toUpperCase(),
            className: '',
            dataset: {},
            textContent: '',
            children: [],
            attributes: new Map(),

            addEventListener() {},

            setAttribute(name, value) {
                this.attributes.set(name, String(value));
            },

            append(...children) {
                this.children.push(...children);
            },
        };
    }

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

                    if (
                        selector ===
                        '#chromatic-dialogue-assignment-list'
                    ) {
                        return assignmentList;
                    }

                    if (
                        selector ===
                        '#chromatic-dialogue-assignment-fields'
                    ) {
                        return assignmentFormFieldset;
                    }

                    return null;
                },
            };
        },
    };

    const originalDocument = globalThis.document;
    const originalSillyTavern = globalThis.SillyTavern;
    const originalGetComputedStyle = globalThis.getComputedStyle;

    t.after(() => {
        clearAllPendingReviews();

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

        if (originalGetComputedStyle === undefined) {
            delete globalThis.getComputedStyle;
        } else {
            globalThis.getComputedStyle = originalGetComputedStyle;
        }
    });

    globalThis.document = {
        head: {
            append(element) {
                styleAppendCount += 1;
                generatedStyle = element;
            },
        },

        getElementById(id) {
            if (id === GENERATED_STYLE_ID) {
                return generatedStyle;
            }

            if (id === 'extensions_settings2') {
                return settingsContainer;
            }

            if (id === 'chromatic-dialogue-settings') {
                return panel;
            }

            return null;
        },
        createElement(tagName) {
            if (tagName === 'style') {
                return {
                    id: '',
                    tagName: 'STYLE',
                    textContent: '',
                };
            }

            return createMockElement(tagName);
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
        get chatMetadata() {
            return activeChatMetadata;
        },
        get chat() {
            return activeChat;
        },

        saveMetadata() {
            saveMetadataCalled = true;
            assert.fail('saveMetadata must not be called during message inspection');
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

    assert.equal(
        handlers.get(eventTypes.MESSAGE_RECEIVED)?.length,
        1,
    );

    onActivate();

    const appInitializedHandlers =
        handlers.get(eventTypes.APP_INITIALIZED) ?? [];

    const chatChangedHandlers =
        handlers.get(eventTypes.CHAT_CHANGED) ?? [];

    const messageReceivedHandlers =
        handlers.get(eventTypes.MESSAGE_RECEIVED) ?? [];

    assert.equal(appInitializedHandlers.length, 1);
    assert.equal(chatChangedHandlers.length, 1);
    assert.equal(messageReceivedHandlers.length, 1);

    assert.equal(typeof globalThis.getComputedStyle, 'undefined');
    assert.equal(typeof globalThis.document.querySelector, 'undefined');

    activeChatId = 'Example chat';
    activeChatMetadata = {
        [CHAT_METADATA_KEY]: {
            schemaVersion: 1,
            assignments: {
                c1: {
                    name: '<img src=x onerror=alert(1)>',
                    color: '#56B4E9',
                },
            },
        },
    };

    await chatChangedHandlers[0]();

    assert.equal(panel, null);
    assert.equal(templateRenderCount, 0);
    assert.equal(panelInsertCount, 0);

    assert.equal(styleAppendCount, 1);
    assert.ok(generatedStyle);
    assert.equal(generatedStyle.id, GENERATED_STYLE_ID);
    assert.equal(generatedStyle.tagName, 'STYLE');
    assert.equal(
        generatedStyle.textContent,
        '#chat .mes_text .custom-cd-c1,\n' +
            '#chat .mes_text .custom-cd-c1 q {\n' +
            '    color: #56B4E9;\n' +
            '}',
    );

    await Promise.all([
        appInitializedHandlers[0](),
        appInitializedHandlers[0](),
        appInitializedHandlers[0](),
    ]);

    assert.equal(templateRenderCount, 1);
    assert.equal(panelInsertCount, 1);
    assert.equal(
        handlers.get(eventTypes.CHAT_CHANGED)?.length,
        1,
    );

    assert.equal(styleAppendCount, 1);
    assert.equal(
        generatedStyle.textContent,
        '#chat .mes_text .custom-cd-c1,\n' +
            '#chat .mes_text .custom-cd-c1 q {\n' +
            '    color: #56B4E9;\n' +
            '}',
    );

    assert.equal(panel.dataset.chatState, 'active');
    assert.equal(noChatState.hidden, true);
    assert.equal(emptyChatState.hidden, true);
    assert.equal(assignmentList.hidden, false);
    assert.equal(assignmentList.children.length, 1);

    assert.equal(assignmentFormFieldset.disabled, false);

    const [assignmentRow] = assignmentList.children;

    assert.equal(assignmentRow.dataset.assignmentId, 'c1');
    assert.equal(
        assignmentRow.attributes.get('role'),
        'listitem',
    );
    assert.deepEqual(
        assignmentRow.children
            .slice(0, 3)
            .map((element) => element.textContent),
        [
            'c1',
            '<img src=x onerror=alert(1)>',
            '#56B4E9',
        ],
    );

    const assignmentActions = assignmentRow.children[3];
    const [editButton, deleteButton] = assignmentActions.children;

    assert.equal(editButton.textContent, 'Edit');
    assert.equal(
        editButton.attributes.get('aria-label'),
        'Edit assignment c1',
    );
    assert.equal(deleteButton.textContent, 'Delete');
    assert.equal(
        deleteButton.attributes.get('aria-label'),
        'Delete assignment c1',
    );

    const chatAState = {
        [CHAT_METADATA_KEY]: {
            schemaVersion: 1,
            assignments: {
                c1: {
                    name: 'Catherine',
                    color: '#56B4E9',
                },
            },
        },
    };

    const chatBState = {
        [CHAT_METADATA_KEY]: {
            schemaVersion: 1,
            assignments: {
                c1: {
                    name: 'Daniel',
                    color: '#E69F00',
                },
            },
        },
    };

    const activateChat = async (chatId, chatMetadata) => {
        activeChatId = chatId;
        activeChatMetadata = chatMetadata;
        await chatChangedHandlers[0]();
    };

    const assertRenderedAssignment = (name, color) => {
        assert.equal(assignmentList.children.length, 1);
        assert.deepEqual(
            assignmentList.children[0].children
                .slice(0, 3)
                .map((element) => element.textContent),
            ['c1', name, color],
        );
        assert.equal(
            generatedStyle.textContent,
            '#chat .mes_text .custom-cd-c1,\n' +
                '#chat .mes_text .custom-cd-c1 q {\n' +
                `    color: ${color};\n` +
                '}',
        );
    };

    await activateChat('chat-a', chatAState);
    assertRenderedAssignment('Catherine', '#56B4E9');

    await activateChat('chat-b', chatBState);
    assertRenderedAssignment('Daniel', '#E69F00');

    await activateChat('chat-a', chatAState);
    assertRenderedAssignment('Catherine', '#56B4E9');

    for (let index = 0; index < 25; index += 1) {
        const useChatA = index % 2 === 0;

        await activateChat(
            useChatA ? 'chat-a' : 'chat-b',
            useChatA ? chatAState : chatBState,
        );
    }

    assert.equal(activeChatId, 'chat-a');
    assertRenderedAssignment('Catherine', '#56B4E9');

    await activateChat('chat-b', chatBState);
    assertRenderedAssignment('Daniel', '#E69F00');

    await activateChat('new-blank-chat', {});

    assert.equal(panel.dataset.chatState, 'active');
    assert.equal(noChatState.hidden, true);
    assert.equal(emptyChatState.hidden, false);
    assert.equal(assignmentFormFieldset.disabled, false);
    assert.equal(assignmentList.hidden, true);
    assert.deepEqual(assignmentList.children, []);
    assert.equal(generatedStyle.textContent, '');

    await appInitializedHandlers[0]();

    assert.equal(templateRenderCount, 1);
    assert.equal(panelInsertCount, 1);
    assert.equal(
        handlers.get(eventTypes.CHAT_CHANGED)?.length,
        1,
    );
    assert.equal(styleAppendCount, 1);

    activeChatId = '   ';
    activeChatMetadata = {};

    await chatChangedHandlers[0]();

    assert.equal(panel.dataset.chatState, 'none');
    assert.equal(noChatState.hidden, false);
    assert.equal(emptyChatState.hidden, true);

    assert.equal(assignmentFormFieldset.disabled, true);

    assert.equal(assignmentList.hidden, true);
    assert.deepEqual(assignmentList.children, []);

    assert.equal(styleAppendCount, 1);
    assert.equal(generatedStyle.textContent, '');

    activeChatId = 'Unsupported chat';
    activeChatMetadata = {
        [CHAT_METADATA_KEY]: {
            schemaVersion: 2,
            assignments: {
                c1: {
                    name: 'Do not interpret',
                    color: '#FFFFFF',
                },
            },
        },
    };

    await chatChangedHandlers[0]();

    assert.equal(panel.dataset.chatState, 'active');
    assert.equal(noChatState.hidden, true);
    assert.equal(emptyChatState.hidden, false);
    assert.equal(assignmentList.hidden, true);
    assert.deepEqual(assignmentList.children, []);
    assert.equal(assignmentFormFieldset.disabled, true);
    assert.equal(generatedStyle.textContent, '');

    const rawMessage =
        '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';

    activeChatId = 'runtime-chat';
    activeChatMetadata = {};
    activeChat = [
        {
            mes: rawMessage,
            is_user: false,
        },
    ];

    let querySelectorCalls = 0;
    let getComputedStyleCalls = 0;

    const mesText = {
        parentElement: null,
        style: { backgroundColor: 'rgb(24, 24, 24)' },
    };

    globalThis.document.querySelector = (selector) => {
        querySelectorCalls += 1;
        if (selector === '#chat .mes_text' || selector === '#chat') {
            return mesText;
        }
        return null;
    };

    globalThis.getComputedStyle = (element) => {
        getComputedStyleCalls += 1;
        return {
            backgroundColor:
                element?.style?.backgroundColor || 'rgba(0, 0, 0, 0)',
        };
    };

    messageReceivedHandlers[0](0);

    assert.ok(querySelectorCalls > 0);
    assert.ok(getComputedStyleCalls > 0);

    delete globalThis.document.querySelector;
    delete globalThis.getComputedStyle;

    const pendingReview = getPendingReview('runtime-chat', 0);
    assert.ok(pendingReview);
    assert.equal(pendingReview.chatId, 'runtime-chat');
    assert.equal(pendingReview.messageId, 0);
    assert.equal(pendingReview.proposals.length, 1);
    assert.equal(pendingReview.proposals[0].id, 'c1');
    assert.equal(pendingReview.proposals[0].name, 'Alice');

    assert.equal(activeChatMetadata[CHAT_METADATA_KEY], undefined);
    assert.equal(activeChatMetadata.chromatic_dialogue, undefined);
    assert.deepEqual(activeChatMetadata, {});
    assert.equal(saveMetadataCalled, false);

    assert.equal(activeChat[0].mes, rawMessage);
    assert.ok(activeChat[0].mes.includes('<!-- CD_NEW'));
});