import {
    ASSIGNMENT_ADD_BUTTON_ID,
    ASSIGNMENT_CANCEL_EDIT_BUTTON_ID,
    ASSIGNMENT_COLOR_PICKER_ID,
    ASSIGNMENT_COLOR_PREVIEW_ID,
    ASSIGNMENT_FEEDBACK_ID,
    ASSIGNMENT_FORM_FIELDSET_ID,
    ASSIGNMENT_FORM_LEGEND_ID,
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
const registeredAssignmentForms = new WeakSet();
const assignmentEditorStates = new WeakMap();

/**
 * Obtain panel-scoped transient editor state.
 *
 * The originating chat ID and selected assignment ID are kept outside the DOM
 * so changes to form controls cannot redirect an edit to another assignment.
 *
 * @param {HTMLElement} panel
 * @returns {{
 *     editingId: string | null,
 *     editingChatId: string | null,
 *     saving: boolean,
 * }}
 */
function getAssignmentEditorState(panel) {
    let editorState = assignmentEditorStates.get(panel);

    if (!editorState) {
        editorState = {
            editingId: null,
            editingChatId: null,
            saving: false,
        };

        assignmentEditorStates.set(panel, editorState);
    }

    return editorState;
}

/**
 * Reflect the current add/edit mode in the form controls.
 *
 * Assignment IDs are intentionally immutable during edit. Renaming an ID
 * would change the Regex class identity and is deferred to a future explicit
 * migration workflow.
 *
 * @param {HTMLElement} panel
 */
function refreshAssignmentFormMode(panel) {
    const { editingId } = getAssignmentEditorState(panel);
    const isEditing = Boolean(editingId);
    const idInput = panel.querySelector(
        `#${ASSIGNMENT_ID_INPUT_ID}`,
    );
    const formLegend = panel.querySelector(
        `#${ASSIGNMENT_FORM_LEGEND_ID}`,
    );
    const submitButton = panel.querySelector(
        `#${ASSIGNMENT_ADD_BUTTON_ID}`,
    );
    const cancelButton = panel.querySelector(
        `#${ASSIGNMENT_CANCEL_EDIT_BUTTON_ID}`,
    );

    if (idInput) {
        idInput.readOnly = isEditing;
    }

    if (formLegend) {
        formLegend.textContent = isEditing
            ? `Edit assignment ${editingId}`
            : 'Add assignment';
    }

    if (submitButton) {
        submitButton.textContent = isEditing
            ? 'Save changes'
            : 'Add assignment';
    }

    if (cancelButton) {
        cancelButton.hidden = !isEditing;
    }

    panel.dataset.assignmentMode = isEditing ? 'edit' : 'add';
}

/**
 * Leave edit mode and optionally clear identity/name fields.
 *
 * @param {HTMLElement} panel
 * @param {{ clearFields?: boolean }} [options]
 */
function clearAssignmentEditing(
    panel,
    { clearFields = true } = {},
) {
    const editorState = getAssignmentEditorState(panel);

    editorState.editingId = null;
    editorState.editingChatId = null;

    if (clearFields) {
        const idInput = panel.querySelector(
            `#${ASSIGNMENT_ID_INPUT_ID}`,
        );
        const nameInput = panel.querySelector(
            `#${ASSIGNMENT_NAME_INPUT_ID}`,
        );

        if (idInput) {
            idInput.value = '';
        }

        if (nameInput) {
            nameInput.value = '';
        }
    }

    refreshAssignmentFormMode(panel);
}

/**
 * Disable all controls that could change editor identity during persistence.
 *
 * @param {HTMLElement} panel
 * @param {boolean} saving
 */
function setAssignmentSaving(panel, saving) {
    const editorState = getAssignmentEditorState(panel);
    const fieldset = panel.querySelector(
        `#${ASSIGNMENT_FORM_FIELDSET_ID}`,
    );
    const submitButton = panel.querySelector(
        `#${ASSIGNMENT_ADD_BUTTON_ID}`,
    );
    const cancelButton = panel.querySelector(
        `#${ASSIGNMENT_CANCEL_EDIT_BUTTON_ID}`,
    );

    editorState.saving = saving;

    if (fieldset) {
        const { status } = readActiveChatState();

        fieldset.disabled = saving || status !== 'ready';
    }

    if (submitButton) {
        submitButton.disabled = saving;
    }

    if (cancelButton) {
        cancelButton.disabled = saving;
    }

    const actionButtonSelectors = [
        '.chromatic-dialogue-assignment-edit',
        '.chromatic-dialogue-assignment-delete',
    ];

    for (const selector of actionButtonSelectors) {
        const actionButtons =
            typeof panel.querySelectorAll === 'function'
                ? panel.querySelectorAll(selector)
                : [];

        for (const actionButton of actionButtons) {
            actionButton.disabled = saving;
        }
    }
}

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
 * Validate and persist assignment form operations once per mounted panel.
 *
 * Every operation rereads fresh normalized active-chat state. Edit identity is
 * taken from panel-scoped state rather than mutable form values. Successful
 * saves refresh generated CSS and the rendered assignment list immediately.
 *
 * @param {HTMLElement} panel
 */
function registerAssignmentForm(panel) {
    if (registeredAssignmentForms.has(panel)) {
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
    const submitButton = panel.querySelector(
        `#${ASSIGNMENT_ADD_BUTTON_ID}`,
    );
    const cancelButton = panel.querySelector(
        `#${ASSIGNMENT_CANCEL_EDIT_BUTTON_ID}`,
    );
    const feedback = panel.querySelector(
        `#${ASSIGNMENT_FEEDBACK_ID}`,
    );

    if (
        !idInput ||
        !nameInput ||
        !hexColorInput ||
        !submitButton ||
        !feedback
    ) {
        return;
    }

    submitButton.addEventListener('click', async () => {
        const editorState = getAssignmentEditorState(panel);

        if (editorState.saving) {
            return;
        }

        const editingId = editorState.editingId;
        const editingChatId = editorState.editingChatId;
        const isEditing = Boolean(editingId);
        const { status, chatId, state } = readActiveChatState();

        if (status !== 'ready' || !chatId) {
            if (isEditing) {
                clearAssignmentEditing(panel);
            }

            showAssignmentFeedback(
                feedback,
                isEditing
                    ? 'Open a supported chat before saving assignment changes.'
                    : 'Open a supported chat before adding an assignment.',
                'error',
            );
            return;
        }

        if (
            isEditing &&
            editingChatId !== chatId
        ) {
            clearAssignmentEditing(panel);
            showAssignmentFeedback(
                feedback,
                'The active chat changed after this assignment was selected. Select it again before editing.',
                'error',
            );
            return;
        }

        if (
            isEditing &&
            !Object.prototype.hasOwnProperty.call(
                state.assignments,
                editingId,
            )
        ) {
            clearAssignmentEditing(panel);
            showAssignmentFeedback(
                feedback,
                'The selected assignment is no longer available.',
                'error',
            );
            return;
        }

        const enteredId = normalizeAssignmentId(idInput.value);

        if (!enteredId) {
            showAssignmentFeedback(
                feedback,
                'Assignment ID must be c1 through c99.',
                'error',
            );
            return;
        }

        if (isEditing && enteredId !== editingId) {
            showAssignmentFeedback(
                feedback,
                'Assignment IDs cannot be changed while editing.',
                'error',
            );
            return;
        }

        const id = editingId ?? enteredId;
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
            !isEditing &&
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

        setAssignmentSaving(panel, true);

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

                if (
                    isEditing &&
                    (
                        result.status === 'no-chat' ||
                        result.status === 'chat-changed'
                    ) &&
                    editorState.editingId === editingId &&
                    editorState.editingChatId === editingChatId
                ) {
                    clearAssignmentEditing(panel);
                }

                return;
            }

            if (isEditing) {
                clearAssignmentEditing(panel);
            }

            refreshDialogueStyles();
            refreshPanelState();

            if (!isEditing) {
                idInput.value = '';
                nameInput.value = '';
            }

            showAssignmentFeedback(
                feedback,
                isEditing
                    ? `Assignment ${id} updated.`
                    : `Assignment ${id} added.`,
                'valid',
            );
        } catch (error) {
            console.error(
                isEditing
                    ? '[Chromatic Dialogue] Failed to edit assignment.'
                    : '[Chromatic Dialogue] Failed to add assignment.',
                error,
            );

            showAssignmentFeedback(
                feedback,
                'The assignment operation failed. Check the browser console for details.',
                'error',
            );
        } finally {
            setAssignmentSaving(panel, false);
        }
    });

    if (cancelButton) {
        cancelButton.addEventListener('click', () => {
            const editorState = getAssignmentEditorState(panel);

            if (editorState.saving || !editorState.editingId) {
                return;
            }

            clearAssignmentEditing(panel);
            showAssignmentFeedback(
                feedback,
                'Editing cancelled. No changes were saved.',
                'valid',
            );
        });
    }

    registeredAssignmentForms.add(panel);
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
    const editorState = getAssignmentEditorState(panel);

    if (editorState.saving) {
        return;
    }

    const feedback = panel.querySelector(
        `#${ASSIGNMENT_FEEDBACK_ID}`,
    );
    const id = normalizeAssignmentId(assignmentId);
    const { status, chatId, state } = readActiveChatState();
    const assignment =
        status === 'ready' && chatId && id
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

    editorState.editingId = id;
    editorState.editingChatId = chatId;

    idInput.value = id;
    nameInput.value = assignment.name;
    colorPicker.value = assignment.color;
    hexColorInput.value = assignment.color;

    if (colorPreview) {
        colorPreview.style.color = assignment.color;
    }

    refreshAssignmentFormMode(panel);

    if (feedback) {
        showAssignmentFeedback(
            feedback,
            `Assignment ${id} loaded for editing. No changes have been saved.`,
            'valid',
        );
    }
}

/**
 * Confirm and delete one assignment from fresh active-chat state.
 *
 * The chat and assignment snapshot are checked both before and after the
 * synchronous confirmation prompt. A detached candidate is then persisted
 * through the same chat-identity-safe storage path used by add and edit.
 *
 * @param {HTMLElement} panel
 * @param {string} assignmentId
 * @returns {Promise<void>}
 */
async function deleteAssignment(panel, assignmentId) {
    const editorState = getAssignmentEditorState(panel);

    if (editorState.saving) {
        return;
    }

    const feedback = panel.querySelector(
        `#${ASSIGNMENT_FEEDBACK_ID}`,
    );

    if (!feedback) {
        return;
    }

    const id = normalizeAssignmentId(assignmentId);
    const initial = readActiveChatState();
    const assignment =
        initial.status === 'ready' && initial.chatId && id
            ? initial.state.assignments[id]
            : undefined;

    if (!assignment) {
        showAssignmentFeedback(
            feedback,
            initial.status === 'ready'
                ? 'The selected assignment is no longer available.'
                : 'Open a supported chat before deleting an assignment.',
            'error',
        );
        return;
    }

    const confirmed =
        typeof globalThis.confirm === 'function' &&
        globalThis.confirm(
            `Delete assignment ${id} (${assignment.name})? This cannot be undone.`,
        );

    if (!confirmed) {
        showAssignmentFeedback(
            feedback,
            'Deletion cancelled. No changes were saved.',
            'valid',
        );
        return;
    }

    const current = readActiveChatState();

    if (
        current.status !== 'ready' ||
        current.chatId !== initial.chatId
    ) {
        if (
            editorState.editingChatId === initial.chatId
        ) {
            clearAssignmentEditing(panel);
        }

        showAssignmentFeedback(
            feedback,
            'The active chat changed before the assignment could be deleted.',
            'error',
        );
        return;
    }

    const currentAssignment = current.state.assignments[id];

    if (
        !currentAssignment ||
        currentAssignment.name !== assignment.name ||
        currentAssignment.color !== assignment.color
    ) {
        showAssignmentFeedback(
            feedback,
            'The selected assignment changed before deletion. Review it and try again.',
            'error',
        );
        return;
    }

    const assignments = {
        ...current.state.assignments,
    };

    delete assignments[id];

    const candidate = {
        schemaVersion: current.state.schemaVersion,
        assignments,
    };

    setAssignmentSaving(panel, true);

    try {
        const result = await saveActiveChatState(
            current.chatId,
            candidate,
        );

        if (result.status !== 'saved') {
            const failureMessages = {
                'invalid-state':
                    'The assignment could not be deleted because the state was invalid.',
                'no-chat':
                    'The active chat closed before the assignment could be deleted.',
                'chat-changed':
                    'The active chat changed before the assignment could be deleted.',
            };

            if (
                (
                    result.status === 'no-chat' ||
                    result.status === 'chat-changed'
                ) &&
                editorState.editingChatId === current.chatId
            ) {
                clearAssignmentEditing(panel);
            }

            showAssignmentFeedback(
                feedback,
                failureMessages[result.status] ??
                    'The assignment could not be deleted.',
                'error',
            );
            return;
        }

        if (
            editorState.editingId === id &&
            editorState.editingChatId === current.chatId
        ) {
            clearAssignmentEditing(panel);
        }

        refreshDialogueStyles();
        refreshPanelState();
        showAssignmentFeedback(
            feedback,
            `Assignment ${id} deleted.`,
            'valid',
        );
    } catch (error) {
        console.error(
            '[Chromatic Dialogue] Failed to delete assignment.',
            error,
        );
        showAssignmentFeedback(
            feedback,
            'The assignment deletion failed. Check the browser console for details.',
            'error',
        );
    } finally {
        setAssignmentSaving(panel, false);
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
    editButton.disabled = getAssignmentEditorState(panel).saving;
    editButton.setAttribute(
        'aria-label',
        `Edit assignment ${id}`,
    );

    editButton.addEventListener('click', () => {
        selectAssignmentForEditing(panel, id);
    });

    const deleteButton = document.createElement('button');
    deleteButton.className =
        'menu_button chromatic-dialogue-assignment-delete';
    deleteButton.type = 'button';
    deleteButton.textContent = 'Delete';
    deleteButton.disabled = getAssignmentEditorState(panel).saving;
    deleteButton.setAttribute(
        'aria-label',
        `Delete assignment ${id}`,
    );

    deleteButton.addEventListener('click', async () => {
        await deleteAssignment(panel, id);
    });

    actions.append(editButton, deleteButton);

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
    registerAssignmentForm(panel);

    const { status, chatId, state } = readActiveChatState();
    const editorState = getAssignmentEditorState(panel);
    const hasCurrentEditingTarget =
        Boolean(editorState.editingId) &&
        status === 'ready' &&
        chatId === editorState.editingChatId &&
        Object.prototype.hasOwnProperty.call(
            state.assignments,
            editorState.editingId,
        );

    if (editorState.editingId && !hasCurrentEditingTarget) {
        clearAssignmentEditing(panel);
    } else {
        refreshAssignmentFormMode(panel);
    }

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
        assignmentFormFieldset.disabled =
            editorState.saving || status !== 'ready';
    }

    if (assignmentFeedback) {
        assignmentFeedback.textContent = '';
        delete assignmentFeedback.dataset.feedbackKind;
        assignmentFeedback.hidden = true;
    }

    panel.dataset.chatState = hasActiveChat ? 'active' : 'none';
}
