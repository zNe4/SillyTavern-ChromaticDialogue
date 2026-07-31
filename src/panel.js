import {
    ASSIGNMENT_ADD_BUTTON_ID,
    ASSIGNMENT_COLOR_PICKER_ID,
    ASSIGNMENT_COLOR_PREVIEW_ID,
    ASSIGNMENT_FEEDBACK_ID,
    ASSIGNMENT_FORM_FIELDSET_ID,
    ASSIGNMENT_HEX_COLOR_INPUT_ID,
    ASSIGNMENT_ID_INPUT_ID,
    ASSIGNMENT_LIST_ID,
    ASSIGNMENT_NAME_INPUT_ID,
    EMPTY_CHAT_STATE_ID,
    EXTENSION_FOLDER,
    EXTENSIONS_SETTINGS_CONTAINER_ID,
    NO_CHAT_STATE_ID,
    PANEL_ID,
} from './constants.js';
import {
    normalizeAssignmentId,
    normalizeHexColor,
    normalizeName,
} from './domain.js';
import {
    readActiveChatState,
    saveActiveChatState,
} from './chat-store.js';
import { refreshDialogueStyles } from './style-runtime.js';

const synchronizedColorPanels = new WeakSet();
const assignmentAddPanels = new WeakSet();

/**
 * Synchronize the color controls and preview exactly once per panel.
 *
 * Partial or malformed hexadecimal input remains available for correction and
 * does not alter the picker or preview. This function never writes metadata.
 *
 * @param {HTMLElement} panel
 */
function registerColorSynchronization(panel) {
    if (synchronizedColorPanels.has(panel)) {
        return;
    }

    const colorPicker = panel.querySelector(
        `#${ASSIGNMENT_COLOR_PICKER_ID}`,
    );
    const hexColorInput = panel.querySelector(
        `#${ASSIGNMENT_HEX_COLOR_INPUT_ID}`,
    );
    const colorPreview = panel.querySelector(
        `#${ASSIGNMENT_COLOR_PREVIEW_ID}`,
    );

    if (!colorPicker || !hexColorInput) {
        return;
    }

    const updatePreview = (color) => {
        if (colorPreview) {
            colorPreview.style.color = color;
        }
    };

    const initialColor =
        normalizeHexColor(hexColorInput.value) ??
        normalizeHexColor(colorPicker.value);

    if (initialColor) {
        updatePreview(initialColor);
    }

    colorPicker.addEventListener('input', () => {
        const color = normalizeHexColor(colorPicker.value);

        if (!color) {
            return;
        }

        hexColorInput.value = color;
        updatePreview(color);
    });

    hexColorInput.addEventListener('input', () => {
        const color = normalizeHexColor(hexColorInput.value);

        if (!color) {
            return;
        }

        hexColorInput.value = color;
        colorPicker.value = color;
        updatePreview(color);
    });

    synchronizedColorPanels.add(panel);
}

/**
 * Display validation feedback without interpreting its contents as HTML.
 *
 * @param {HTMLElement} feedback
 * @param {string} message
 * @param {'error' | 'valid'} kind
 */
function showAssignmentFeedback(feedback, message, kind) {
    feedback.textContent = message;
    feedback.dataset.feedbackKind = kind;
    feedback.hidden = false;
}

/**
 * Validate and add assignments exactly once per mounted panel.
 *
 * Every click reads fresh normalized active-chat state. A successful save
 * refreshes generated CSS and the rendered assignment list immediately.
 *
 * @param {HTMLElement} panel
 */
function registerAssignmentAdd(panel) {
    if (assignmentAddPanels.has(panel)) {
        return;
    }

    const idInput = panel.querySelector(
        `#${ASSIGNMENT_ID_INPUT_ID}`,
    );
    const nameInput = panel.querySelector(
        `#${ASSIGNMENT_NAME_INPUT_ID}`,
    );
    const hexColorInput = panel.querySelector(
        `#${ASSIGNMENT_HEX_COLOR_INPUT_ID}`,
    );
    const addButton = panel.querySelector(
        `#${ASSIGNMENT_ADD_BUTTON_ID}`,
    );
    const feedback = panel.querySelector(
        `#${ASSIGNMENT_FEEDBACK_ID}`,
    );

    if (
        !idInput ||
        !nameInput ||
        !hexColorInput ||
        !addButton ||
        !feedback
    ) {
        return;
    }

    addButton.addEventListener('click', async () => {
        const { status, chatId, state } = readActiveChatState();

        if (status !== 'ready' || !chatId) {
            showAssignmentFeedback(
                feedback,
                'Open a supported chat before adding an assignment.',
                'error',
            );
            return;
        }

        const id = normalizeAssignmentId(idInput.value);

        if (!id) {
            showAssignmentFeedback(
                feedback,
                'Assignment ID must be c1 through c99.',
                'error',
            );
            return;
        }

        const name = normalizeName(nameInput.value);

        if (!name) {
            showAssignmentFeedback(
                feedback,
                'Name cannot be empty.',
                'error',
            );
            return;
        }

        const color = normalizeHexColor(hexColorInput.value);

        if (!color) {
            showAssignmentFeedback(
                feedback,
                'Color must be a six-digit hexadecimal value such as #56B4E9.',
                'error',
            );
            return;
        }

        if (
            Object.prototype.hasOwnProperty.call(
                state.assignments,
                id,
            )
        ) {
            showAssignmentFeedback(
                feedback,
                `Assignment ${id} already exists.`,
                'error',
            );
            return;
        }

        const candidate = {
            schemaVersion: state.schemaVersion,
            assignments: {
                ...state.assignments,
                [id]: {
                    name,
                    color,
                },
            },
        };

        addButton.disabled = true;

        try {
            const result = await saveActiveChatState(
                chatId,
                candidate,
            );

            if (result.status !== 'saved') {
                const failureMessages = {
                    'invalid-state':
                        'The assignment could not be saved because the state was invalid.',
                    'no-chat':
                        'The active chat closed before the assignment could be saved.',
                    'chat-changed':
                        'The active chat changed before the assignment could be saved.',
                };

                showAssignmentFeedback(
                    feedback,
                    failureMessages[result.status] ??
                        'The assignment could not be saved.',
                    'error',
                );
                return;
            }

            refreshDialogueStyles();
            refreshPanelState();

            idInput.value = '';
            nameInput.value = '';

            showAssignmentFeedback(
                feedback,
                `Assignment ${id} added.`,
                'valid',
            );
        } catch (error) {
            console.error(
                '[Chromatic Dialogue] Failed to add assignment.',
                error,
            );

            showAssignmentFeedback(
                feedback,
                'The assignment operation failed. Check the browser console for details.',
                'error',
            );
        } finally {
            addButton.disabled = false;
        }
    });

    assignmentAddPanels.add(panel);
}

/**
 * Create the extension settings panel if it is not already present.
 *
 * @returns {Promise<HTMLElement>}
 */
export async function ensurePanel() {
    const existingPanel = document.getElementById(PANEL_ID);

    if (existingPanel) {
        return existingPanel;
    }

    const container = document.getElementById(
        EXTENSIONS_SETTINGS_CONTAINER_ID,
    );

    if (!container) {
        throw new Error(
            `Missing SillyTavern settings container #${EXTENSIONS_SETTINGS_CONTAINER_ID}.`,
        );
    }

    const { renderExtensionTemplateAsync } = SillyTavern.getContext();
    const panelHtml = await renderExtensionTemplateAsync(
        EXTENSION_FOLDER,
        'settings',
    );

    container.insertAdjacentHTML('beforeend', panelHtml);

    const mountedPanel = document.getElementById(PANEL_ID);

    if (!mountedPanel) {
        throw new Error(`Template did not create #${PANEL_ID}.`);
    }

    return mountedPanel;
}

/**
 * Load one current assignment into the form without saving any changes.
 *
 * The assignment is read again from fresh normalized active-chat state rather
 * than relying on values captured when its row was rendered.
 *
 * @param {HTMLElement} panel
 * @param {string} assignmentId
 */
function selectAssignmentForEditing(panel, assignmentId) {
    const feedback = panel.querySelector(
        `#${ASSIGNMENT_FEEDBACK_ID}`,
    );
    const id = normalizeAssignmentId(assignmentId);
    const { status, state } = readActiveChatState();
    const assignment =
        status === 'ready' && id
            ? state.assignments[id]
            : undefined;

    if (!assignment) {
        if (feedback) {
            showAssignmentFeedback(
                feedback,
                'The selected assignment is no longer available.',
                'error',
            );
        }

        return;
    }

    const idInput = panel.querySelector(
        `#${ASSIGNMENT_ID_INPUT_ID}`,
    );
    const nameInput = panel.querySelector(
        `#${ASSIGNMENT_NAME_INPUT_ID}`,
    );
    const colorPicker = panel.querySelector(
        `#${ASSIGNMENT_COLOR_PICKER_ID}`,
    );
    const hexColorInput = panel.querySelector(
        `#${ASSIGNMENT_HEX_COLOR_INPUT_ID}`,
    );
    const colorPreview = panel.querySelector(
        `#${ASSIGNMENT_COLOR_PREVIEW_ID}`,
    );

    if (
        !idInput ||
        !nameInput ||
        !colorPicker ||
        !hexColorInput
    ) {
        return;
    }

    idInput.value = id;
    nameInput.value = assignment.name;
    colorPicker.value = assignment.color;
    hexColorInput.value = assignment.color;

    if (colorPreview) {
        colorPreview.style.color = assignment.color;
    }

    if (feedback) {
        showAssignmentFeedback(
            feedback,
            `Assignment ${id} loaded for editing. No changes have been saved.`,
            'valid',
        );
    }
}

/**
 * Sort normalized assignments by their numeric canonical ID.
 *
 * @param {Record<string, { name: string, color: string }>} assignments
 * @returns {Array<[string, { name: string, color: string }]>}
 */
function getSortedAssignmentEntries(assignments) {
    return Object.entries(assignments).sort(
        ([leftId], [rightId]) =>
            Number.parseInt(leftId.slice(1), 10) -
            Number.parseInt(rightId.slice(1), 10),
    );
}

/**
 * Create one assignment row without interpreting stored text as HTML.
 *
 * @param {HTMLElement} panel
 * @param {string} id
 * @param {{ name: string, color: string }} assignment
 * @returns {HTMLElement}
 */
function createAssignmentRow(panel, id, assignment) {
    const row = document.createElement('div');
    row.className = 'chromatic-dialogue-assignment';
    row.dataset.assignmentId = id;
    row.setAttribute('role', 'listitem');

    const idElement = document.createElement('span');
    idElement.className = 'chromatic-dialogue-assignment-id';
    idElement.textContent = id;

    const nameElement = document.createElement('span');
    nameElement.className = 'chromatic-dialogue-assignment-name';
    nameElement.textContent = assignment.name;

    const colorElement = document.createElement('span');
    colorElement.className = 'chromatic-dialogue-assignment-color';
    colorElement.textContent = assignment.color;
    const actions = document.createElement('div');
    actions.className = 'chromatic-dialogue-assignment-actions';

    const editButton = document.createElement('button');
    editButton.className =
        'menu_button chromatic-dialogue-assignment-edit';
    editButton.type = 'button';
    editButton.textContent = 'Edit';
    editButton.setAttribute(
        'aria-label',
        `Edit assignment ${id}`,
    );

    editButton.addEventListener('click', () => {
        selectAssignmentForEditing(panel, id);
    });

    actions.append(editButton);

    row.append(
        idElement,
        nameElement,
        colorElement,
        actions,
    );

    return row;
}

/**
 * Reflect the active-chat state and render its normalized assignments.
 *
 * The refresh itself writes no metadata. Names and other stored values are
 * inserted through textContent rather than interpreted as HTML.
 */
export function refreshPanelState() {
    const panel = document.getElementById(PANEL_ID);

    if (!panel) {
        return;
    }

    registerColorSynchronization(panel);
    registerAssignmentAdd(panel);

    const { status, state } = readActiveChatState();
    const hasActiveChat = status !== 'no-chat';
    const assignmentEntries =
        status === 'ready'
            ? getSortedAssignmentEntries(state.assignments)
            : [];
    const hasAssignments = assignmentEntries.length > 0;

    const noChatState = panel.querySelector(`#${NO_CHAT_STATE_ID}`);
    const emptyChatState = panel.querySelector(`#${EMPTY_CHAT_STATE_ID}`);
    const assignmentList = panel.querySelector(
        `#${ASSIGNMENT_LIST_ID}`,
    );

    const assignmentFormFieldset = panel.querySelector(
        `#${ASSIGNMENT_FORM_FIELDSET_ID}`,
    );

    const assignmentFeedback = panel.querySelector(
        `#${ASSIGNMENT_FEEDBACK_ID}`,
    );

    if (noChatState) {
        noChatState.hidden = hasActiveChat;
    }

    if (emptyChatState) {
        emptyChatState.hidden = !hasActiveChat || hasAssignments;
    }

    if (assignmentList) {
        const rows = assignmentEntries.map(([id, assignment]) =>
            createAssignmentRow(panel, id, assignment),
        );

        assignmentList.replaceChildren(...rows);
        assignmentList.hidden = !hasAssignments;
    }

    if (assignmentFormFieldset) {
        assignmentFormFieldset.disabled = status !== 'ready';
    }

    if (assignmentFeedback) {
        assignmentFeedback.textContent = '';
        delete assignmentFeedback.dataset.feedbackKind;
        assignmentFeedback.hidden = true;
    }

    panel.dataset.chatState = hasActiveChat ? 'active' : 'none';
}
