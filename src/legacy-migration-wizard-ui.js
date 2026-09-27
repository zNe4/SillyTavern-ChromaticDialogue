import { createLegacyMigrationWizardController } from './legacy-migration-wizard-controller.js';

const WAND_CONTAINER_ID = 'chromatic-dialogue-migration-wand-container';
const WAND_ACTION_ID = 'chromatic-dialogue-migrate-legacy-dialogue';
const WAND_MENU_ID = 'extensionsMenu';

const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/;

const ADAPTER_LABELS = {
    'ff-named-color': 'Freaky Frankenstein named color',
    'html-font-color': 'HTML font color',
    'inline-css-color': 'Inline CSS color',
};

const PLANNER_ERROR_LABELS = {
    'invalid-name': 'Enter a character name.',
    'invalid-color': 'Enter a valid six-digit hex color.',
    'assignment-not-found': 'The selected existing assignment no longer exists.',
    'name-already-assigned': 'That character name already exists; reuse the existing assignment instead.',
    'conflicting-new-character-color': 'The same new character was mapped with conflicting final colors.',
    'registry-capacity-exceeded': 'No free Chromatic Dialogue assignment IDs remain.',
    'missing-mapping': 'A source group still needs a mapping.',
    'stale-inventory': 'The chat or Chromatic Dialogue assignments changed since the scan. Rescan before continuing.',
};

const STATUS_LABELS = {
    'applied': 'Migration applied successfully.',
    'applied-reload-failed': 'Migration was saved, but SillyTavern could not refresh the chat view automatically.',
    'applied-chat-changed': 'Migration was saved to the original chat, but another chat became active before refresh.',
    'applied-concurrent-change': 'Migration was saved, but newer same-chat changes were detected after saving; the wizard did not reload automatically.',
    'applied-undo-unavailable': 'Migration was saved, but session undo could not be retained. Advise extra caution.',
    'no-op': 'Nothing needed to be changed.',
    'busy': 'Another migration/undo operation is already running.',
    'stale-preview': 'The approved preview is no longer current. Preview again or Rescan.',
    'plan-rejected': 'Rescan because the underlying migration inventory changed.',
    'save-error': 'Migration was not saved; owned changes were rolled back.',
    'save-error-rollback-incomplete': 'Saving failed and some concurrent changes prevented complete in-memory rollback. Advise reviewing the chat before retrying.',
    'undone': 'Last migration was undone successfully.',
    'undone-reload-failed': 'Undo was saved, but the chat view could not be refreshed automatically.',
    'undone-chat-changed': 'Undo was saved to the original chat, but another chat became active before refresh.',
    'undone-concurrent-change': 'Undo was saved, but newer changes prevented an automatic reload.',
    'stale-undo': 'The migrated messages or CD state changed after migration, so automatic undo was refused.',
    'no-undo': 'No undo snapshot is available for this chat.',
    'no-chat': 'Open a character or group chat first.',
    'invalid-context': 'The current chat context is unavailable or malformed.',
    'invalid-state': 'This chat contains malformed Chromatic Dialogue state. Migration has been blocked rather than repairing it silently.',
    'inventory-error': 'The legacy migration inventory could not be built.',
    'chat-changed': 'The active chat changed while the wizard was open. Rescan the current chat.',
    'incomplete-mappings': 'Choose an action for every migratable source group before previewing.',
    'operation-error': 'An unexpected migration wizard error occurred. No automatic retry was performed.',
};

/**
 * Format group adapters array for presentation.
 *
 * @param {Array<string> | unknown} adapters
 * @returns {string}
 */
function formatAdapters(adapters) {
    if (!Array.isArray(adapters) || adapters.length === 0) {
        return 'Unknown adapter';
    }
    return adapters
        .map((adapterId) => ADAPTER_LABELS[adapterId] || adapterId || 'Unknown adapter')
        .join(' · ');
}

/**
 * Format planner error code for presentation.
 *
 * @param {string} code
 * @returns {string}
 */
function formatPlannerError(code) {
    return PLANNER_ERROR_LABELS[code] || String(code);
}

/**
 * Format operation or scan status for presentation.
 *
 * @param {string} status
 * @param {string} [operation='']
 * @returns {string}
 */
function formatStatus(status, operation = '') {
    if (operation === 'undo') {
        if (status === 'save-error') {
            return 'Undo was not saved; the migrated state remains active.';
        }
        if (status === 'save-error-rollback-incomplete') {
            return 'Undo save failed and concurrent edits prevented complete restoration of the pre-undo in-memory state.';
        }
    }
    return STATUS_LABELS[status] || String(status);
}

/**
 * Safely create a DOM element with optional class and text content.
 *
 * @param {Document} doc
 * @param {string} tag
 * @param {string} [className='']
 * @param {string} [textContent='']
 * @returns {HTMLElement}
 */
function createElement(doc, tag, className = '', textContent = '') {
    const el = doc.createElement(tag);
    if (className) {
        el.className = className;
    }
    if (textContent !== undefined && textContent !== null && textContent !== '') {
        el.textContent = String(textContent);
    }
    return el;
}

/**
 * Install the Magic Wand entry point and popup wizard UI.
 *
 * @param {object} [dependencies={}]
 * @returns {{ status: 'installed' | 'already-installed' | 'unavailable' }}
 */
export function installLegacyMigrationWizardUI(dependencies = {}) {
    const doc = dependencies?.document || globalThis.document;
    const getContext =
        typeof dependencies?.getContext === 'function'
            ? dependencies.getContext
            : () => globalThis.SillyTavern?.getContext?.();
    const createController =
        typeof dependencies?.createController === 'function'
            ? dependencies.createController
            : createLegacyMigrationWizardController;

    if (!doc || typeof doc.getElementById !== 'function') {
        return { status: 'unavailable' };
    }

    const extensionsMenu = doc.getElementById(WAND_MENU_ID);
    if (!extensionsMenu) {
        return { status: 'unavailable' };
    }

    if (doc.getElementById(WAND_ACTION_ID)) {
        return { status: 'already-installed' };
    }

    let container = doc.getElementById(WAND_CONTAINER_ID);
    if (!container) {
        container = createElement(doc, 'div', 'extension_container');
        container.id = WAND_CONTAINER_ID;
        extensionsMenu.appendChild(container);
    }

    const action = createElement(doc, 'div', 'list-group-item flex-container flexGap5');
    action.id = WAND_ACTION_ID;
    action.setAttribute('role', 'button');
    action.tabIndex = 0;

    const icon = createElement(doc, 'i', 'fa-solid fa-palette extensionsMenuExtensionButton');
    const label = createElement(doc, 'span', '', 'Migrate Legacy Dialogue');
    action.appendChild(icon);
    action.appendChild(label);
    container.appendChild(action);

    let isWizardOpen = false;

    /**
     * Launch a fresh migration wizard popup.
     */
    function openWizard() {
        if (isWizardOpen) {
            return;
        }

        const context = typeof getContext === 'function' ? getContext() : null;
        if (
            !context ||
            typeof context.Popup !== 'function' ||
            !context.POPUP_TYPE ||
            !context.POPUP_RESULT
        ) {
            console.warn('[Chromatic Dialogue] Popup APIs are unavailable.');
            return;
        }

        isWizardOpen = true;

        const controller = createController();
        const root = createElement(doc, 'div', 'chromatic-dialogue-migration-wizard');

        let busy = false;
        let lastOperation = '';
        let lastScanResult = null;
        let previewVisibleCount = 10;
        let activePopup = null;

        /**
         * Safe wrapper for host Popup.show.confirm.
         *
         * @param {string} title
         * @param {string} text
         * @param {object} [options={}]
         * @returns {Promise<unknown>}
         */
        async function confirmPrompt(title, text, options = {}) {
            if (typeof context.Popup?.show?.confirm === 'function') {
                return context.Popup.show.confirm(title, text, options);
            }
            return null;
        }

        /**
         * Render wizard contents from current controller state.
         */
        function render() {
            const state = controller.getState();
            root.setAttribute('aria-busy', busy ? 'true' : 'false');

            const fragments = [];

            // 1. Header
            const header = createElement(doc, 'div', 'chromatic-dialogue-migration-header');
            const mainTitle = createElement(doc, 'h3', 'chromatic-dialogue-migration-title', 'Chromatic Dialogue');
            const subTitle = createElement(doc, 'h4', 'chromatic-dialogue-migration-subtitle', 'Legacy Dialogue Migration');
            const safetyDesc = createElement(doc, 'div', 'chromatic-dialogue-migration-safety-note');

            const safetyList = createElement(doc, 'ul');
            safetyList.appendChild(createElement(doc, 'li', '', 'Only explicitly recognized legacy color markup is considered.'));
            safetyList.appendChild(createElement(doc, 'li', '', 'Plain quotation marks are ignored.'));
            safetyList.appendChild(createElement(doc, 'li', '', 'Nothing changes until Apply Migration.'));
            safetyList.appendChild(createElement(doc, 'li', '', 'The character-card greeting is excluded by default.'));
            safetyDesc.appendChild(safetyList);

            header.appendChild(mainTitle);
            header.appendChild(subTitle);
            header.appendChild(safetyDesc);
            fragments.push(header);

            // 2. Toolbar
            const toolbar = createElement(doc, 'div', 'chromatic-dialogue-migration-toolbar');

            const introGroup = createElement(doc, 'div', 'chromatic-dialogue-migration-intro-control');
            const introCheckbox = createElement(doc, 'input');
            introCheckbox.type = 'checkbox';
            introCheckbox.id = 'cd-migration-intro-toggle';
            introCheckbox.checked = Boolean(state.includeIntroduction);
            introCheckbox.disabled = busy;

            const introLabel = createElement(doc, 'label', '', 'Include character-card introductory message');
            introLabel.setAttribute('for', 'cd-migration-intro-toggle');

            introCheckbox.addEventListener('change', async () => {
                const wantsInclude = introCheckbox.checked;
                if (state.completedMappingCount > 0 || state.preview !== null) {
                    const result = await confirmPrompt(
                        'Rescan Chat?',
                        'Changing this option rescans the chat and clears the current mapping work.',
                        {
                            okButton: 'Rescan',
                            cancelButton: 'Cancel',
                        },
                    );
                    if (result !== context.POPUP_RESULT.AFFIRMATIVE) {
                        introCheckbox.checked = state.includeIntroduction;
                        return;
                    }
                }
                busy = true;
                lastOperation = 'rescan';
                render();
                controller.setIncludeIntroduction(wantsInclude);
                busy = false;
                render();
            });

            introGroup.appendChild(introCheckbox);
            introGroup.appendChild(introLabel);
            toolbar.appendChild(introGroup);

            const toolbarActions = createElement(doc, 'div', 'chromatic-dialogue-migration-toolbar-actions');

            const rescanBtn = createElement(doc, 'button', 'menu_button chromatic-dialogue-migration-rescan-button', 'Rescan');
            rescanBtn.type = 'button';
            rescanBtn.disabled = busy;
            rescanBtn.addEventListener('click', async () => {
                if (state.completedMappingCount > 0 || state.preview !== null) {
                    const result = await confirmPrompt(
                        'Rescan Chat?',
                        'Rescanning clears current mappings and preview.',
                        {
                            okButton: 'Rescan',
                            cancelButton: 'Cancel',
                        },
                    );
                    if (result !== context.POPUP_RESULT.AFFIRMATIVE) {
                        return;
                    }
                }
                busy = true;
                lastOperation = 'rescan';
                render();
                lastScanResult = controller.scan();
                busy = false;
                render();
            });
            toolbarActions.appendChild(rescanBtn);

            if (state.undoAvailable) {
                const undoBtn = createElement(doc, 'button', 'menu_button chromatic-dialogue-migration-undo-button', 'Undo Last Migration');
                undoBtn.type = 'button';
                undoBtn.disabled = busy;
                undoBtn.addEventListener('click', async () => {
                    const result = await confirmPrompt(
                        'Undo Last Legacy Migration?',
                        'This restores only the messages changed by the last successful legacy migration and the previous Chromatic Dialogue assignment state. Unrelated later chat changes are preserved. Undo will refuse if migrated content has changed.',
                        {
                            okButton: 'Undo Migration',
                            cancelButton: 'Cancel',
                        },
                    );
                    if (result !== context.POPUP_RESULT.AFFIRMATIVE) {
                        return;
                    }
                    busy = true;
                    lastOperation = 'undo';
                    render();
                    await controller.undo();
                    busy = false;
                    render();
                });
                toolbarActions.appendChild(undoBtn);
            }

            toolbar.appendChild(toolbarActions);
            fragments.push(toolbar);

            // 3. Status / feedback region
            const feedback = createElement(doc, 'div', 'chromatic-dialogue-migration-feedback');
            feedback.setAttribute('aria-live', 'polite');

            let hasNotice = false;
            if (busy) {
                feedback.appendChild(createElement(doc, 'div', 'chromatic-dialogue-migration-status-busy', 'Working…'));
                hasNotice = true;
            } else if (state.lastResult?.status) {
                const statusText = formatStatus(state.lastResult.status, lastOperation);
                const statusEl = createElement(doc, 'div', 'chromatic-dialogue-migration-status-text', statusText);
                feedback.appendChild(statusEl);
                hasNotice = true;

                if (state.lastResult.status === 'plan-rejected' && Array.isArray(state.lastResult.errors)) {
                    const errorList = createElement(doc, 'ul', 'chromatic-dialogue-migration-error-list');
                    for (const err of state.lastResult.errors) {
                        const code = typeof err === 'string' ? err : err?.code;
                        errorList.appendChild(createElement(doc, 'li', '', formatPlannerError(code)));
                    }
                    feedback.appendChild(errorList);
                    feedback.appendChild(createElement(doc, 'div', 'chromatic-dialogue-migration-error-advice', 'Correct mappings above or Rescan before continuing.'));
                }
            } else if (lastScanResult && lastScanResult.status !== 'ready') {
                feedback.appendChild(createElement(doc, 'div', 'chromatic-dialogue-migration-status-text', formatStatus(lastScanResult.status, 'scan')));
                hasNotice = true;
            } else if (state.phase === 'error') {
                feedback.appendChild(createElement(doc, 'div', 'chromatic-dialogue-migration-status-text', formatStatus('operation-error')));
                hasNotice = true;
            }

            if (!hasNotice) {
                feedback.hidden = true;
            }
            fragments.push(feedback);

            // 4. Scan summary
            if (state.inventory && state.inventory.status === 'ready') {
                const summary = createElement(doc, 'div', 'chromatic-dialogue-migration-summary');
                const stats = state.inventory.stats || {};

                const statItems = [
                    { label: 'Messages scanned', value: stats.scannedMessageCount ?? '-' },
                    { label: 'Legacy source groups', value: stats.sourceGroupCount ?? state.inventory.groups?.length ?? 0 },
                    { label: 'Migratable dialogue spans', value: stats.migratableCount ?? 0 },
                    { label: 'Unknown colored content', value: stats.unknownColoredCount ?? 0 },
                    { label: 'Scanner issues', value: stats.issueCount ?? 0 },
                    { label: 'Introductory greeting', value: state.includeIntroduction ? 'Included' : 'Excluded' },
                ];

                for (const item of statItems) {
                    const statBox = createElement(doc, 'div', 'chromatic-dialogue-migration-stat');
                    statBox.appendChild(createElement(doc, 'span', 'chromatic-dialogue-migration-stat-label', item.label));
                    statBox.appendChild(createElement(doc, 'span', 'chromatic-dialogue-migration-stat-value', String(item.value)));
                    summary.appendChild(statBox);
                }

                if (Array.isArray(state.inventory.skippedMessages) && state.inventory.skippedMessages.some((m) => m === 'intro-message' || m?.reason === 'intro-message')) {
                    const introNote = createElement(doc, 'div', 'chromatic-dialogue-migration-intro-note', 'The introductory greeting was intentionally excluded from scanning.');
                    summary.appendChild(introNote);
                }

                fragments.push(summary);

                // Progress indicator
                const progressBox = createElement(doc, 'div', 'chromatic-dialogue-migration-progress');
                progressBox.textContent = `${state.completedMappingCount} of ${state.requiredMappingCount} source groups mapped`;
                fragments.push(progressBox);

                // Groups or empty scan
                if (!state.inventory.groups || state.inventory.groups.length === 0) {
                    const emptyScan = createElement(doc, 'div', 'chromatic-dialogue-migration-empty', 'No recognized legacy colored dialogue was found in this chat.');
                    fragments.push(emptyScan);
                } else {
                    const migratableTotal = state.inventory.groups.filter((g) => g.migratableCount > 0).length;
                    if (migratableTotal === 0) {
                        const nonMigratableNotice = createElement(doc, 'div', 'chromatic-dialogue-migration-empty', 'Legacy colored content was detected, but none of it is safe for automatic dialogue migration.');
                        fragments.push(nonMigratableNotice);
                    }

                    const cardsContainer = createElement(doc, 'div', 'chromatic-dialogue-migration-source-cards');

                    for (const group of state.inventory.groups) {
                        const card = createElement(doc, 'div', 'chromatic-dialogue-migration-source-card');
                        card.setAttribute('data-source-key', group.sourceKey);

                        // Card Header
                        const cardHeader = createElement(doc, 'div', 'chromatic-dialogue-migration-card-header');
                        const sourceTitle = createElement(doc, 'div', 'chromatic-dialogue-migration-source-identity');
                        sourceTitle.textContent = `Source: ${group.sourceValue || group.sourceKey}`;
                        if (group.sourceKey !== group.sourceValue) {
                            const keyNote = createElement(doc, 'span', 'chromatic-dialogue-migration-source-key-detail', ` (${group.sourceKey})`);
                            sourceTitle.appendChild(keyNote);
                        }
                        cardHeader.appendChild(sourceTitle);

                        if (group.suggestedFinalColor && HEX_COLOR_REGEX.test(group.suggestedFinalColor)) {
                            const swatch = createElement(doc, 'span', 'chromatic-dialogue-migration-swatch');
                            swatch.style.backgroundColor = group.suggestedFinalColor;
                            cardHeader.appendChild(swatch);
                            cardHeader.appendChild(createElement(doc, 'span', 'chromatic-dialogue-migration-suggested-color-text', `Suggested final color: ${group.suggestedFinalColor}`));
                        }

                        const adapter = createElement(doc, 'div', 'chromatic-dialogue-migration-adapter', formatAdapters(group.adapters));
                        cardHeader.appendChild(adapter);
                        card.appendChild(cardHeader);

                        // Counts
                        const countsBox = createElement(doc, 'div', 'chromatic-dialogue-migration-counts');
                        const msgCount = Array.isArray(group.messageIndexes) ? group.messageIndexes.length : 0;
                        countsBox.textContent = `Occurrences: ${group.occurrenceCount} · Migratable spans: ${group.migratableCount} · Unknown colored: ${group.unknownColoredCount} · Messages: ${msgCount}`;
                        card.appendChild(countsBox);

                        // Samples
                        if (Array.isArray(group.samples) && group.samples.length > 0) {
                            const details = createElement(doc, 'details', 'chromatic-dialogue-migration-samples');
                            const summaryEl = createElement(doc, 'summary', '', `Samples (${group.samples.length})`);
                            details.appendChild(summaryEl);

                            const sampleList = createElement(doc, 'div', 'chromatic-dialogue-migration-sample-list');
                            for (const sample of group.samples) {
                                const sampleItem = createElement(doc, 'div', 'chromatic-dialogue-migration-sample-item');
                                const toneText = sample.tone ? ` · Tone: ${sample.tone}` : '';
                                const meta = createElement(doc, 'div', 'chromatic-dialogue-migration-sample-meta', `Message ${sample.messageIndex} · ${sample.role}${toneText} · ${sample.classification}`);
                                const content = createElement(doc, 'pre', 'chromatic-dialogue-migration-sample-content', sample.content);
                                sampleItem.appendChild(meta);
                                sampleItem.appendChild(content);
                                sampleList.appendChild(sampleItem);
                            }
                            details.appendChild(sampleList);
                            card.appendChild(details);
                        }

                        // Mapping controls
                        if (group.migratableCount === 0) {
                            const nonMigratableBadge = createElement(doc, 'div', 'chromatic-dialogue-migration-non-migratable', 'Detected but not automatically migratable');
                            card.appendChild(nonMigratableBadge);
                        } else {
                            const mapping = state.mappings.find((m) => m.sourceKey === group.sourceKey);
                            const controls = createElement(doc, 'div', 'chromatic-dialogue-migration-mapping-controls');

                            const actionLabel = createElement(doc, 'label', 'chromatic-dialogue-migration-field-label', 'Action');
                            const actionSelectId = `cd-action-${group.sourceKey.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
                            actionLabel.setAttribute('for', actionSelectId);

                            const actionSelect = createElement(doc, 'select', 'chromatic-dialogue-migration-action-select');
                            actionSelect.id = actionSelectId;
                            actionSelect.disabled = busy;

                            const defaultOpt = createElement(doc, 'option', '', 'Choose an action…');
                            defaultOpt.value = '';
                            actionSelect.appendChild(defaultOpt);

                            const reuseOpt = createElement(doc, 'option', '', 'Reuse existing character');
                            reuseOpt.value = 'reuse';
                            if (mapping?.action === 'reuse') reuseOpt.selected = true;
                            actionSelect.appendChild(reuseOpt);

                            const createOpt = createElement(doc, 'option', '', 'Create new character');
                            createOpt.value = 'create';
                            if (mapping?.action === 'create') createOpt.selected = true;
                            actionSelect.appendChild(createOpt);

                            const skipOpt = createElement(doc, 'option', '', 'Skip this source');
                            skipOpt.value = 'skip';
                            if (mapping?.action === 'skip') skipOpt.selected = true;
                            actionSelect.appendChild(skipOpt);

                            actionSelect.addEventListener('change', () => {
                                const selected = actionSelect.value;
                                if (!selected) {
                                    if (mapping) {
                                        controller.clearMapping(group.sourceKey);
                                        render();
                                    }
                                    return;
                                }
                                if (selected === 'skip') {
                                    controller.setMapping(group.sourceKey, { action: 'skip' });
                                } else if (selected === 'reuse') {
                                    controller.setMapping(group.sourceKey, { action: 'reuse', assignmentId: '' });
                                } else if (selected === 'create') {
                                    controller.setMapping(group.sourceKey, { action: 'create', name: '', color: '' });
                                }
                                render();
                            });

                            controls.appendChild(actionLabel);
                            controls.appendChild(actionSelect);

                            if (mapping?.action === 'skip') {
                                const skipNote = createElement(doc, 'div', 'chromatic-dialogue-migration-skip-note', 'These recognized dialogue spans will remain unchanged.');
                                controls.appendChild(skipNote);
                            } else if (mapping?.action === 'reuse') {
                                const reuseBox = createElement(doc, 'div', 'chromatic-dialogue-migration-reuse-fields');
                                const reuseLabel = createElement(doc, 'label', 'chromatic-dialogue-migration-field-label', 'Assign to character');
                                const reuseSelectId = `cd-reuse-${group.sourceKey.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
                                reuseLabel.setAttribute('for', reuseSelectId);

                                const reuseSelect = createElement(doc, 'select', 'chromatic-dialogue-migration-reuse-select');
                                reuseSelect.id = reuseSelectId;
                                reuseSelect.disabled = busy;

                                const chooseAssignOpt = createElement(doc, 'option', '', 'Choose existing character…');
                                chooseAssignOpt.value = '';
                                reuseSelect.appendChild(chooseAssignOpt);

                                for (const assign of state.inventory.existingAssignments || []) {
                                    const opt = createElement(doc, 'option', '', `${assign.id} — ${assign.name} — ${assign.color}`);
                                    opt.value = assign.id;
                                    if (mapping.assignmentId === assign.id) {
                                        opt.selected = true;
                                    }
                                    reuseSelect.appendChild(opt);
                                }

                                reuseSelect.addEventListener('change', () => {
                                    controller.setMapping(group.sourceKey, {
                                        action: 'reuse',
                                        assignmentId: reuseSelect.value,
                                    });
                                    render();
                                });

                                reuseBox.appendChild(reuseLabel);
                                reuseBox.appendChild(reuseSelect);

                                if (group.suggestedAssignmentId) {
                                    const suggestedAssign = (state.inventory.existingAssignments || []).find((a) => a.id === group.suggestedAssignmentId);
                                    if (suggestedAssign) {
                                        const suggestionBox = createElement(doc, 'div', 'chromatic-dialogue-migration-suggestion');
                                        const suggestionText = createElement(doc, 'span', 'chromatic-dialogue-migration-suggestion-label', `Suggested color match: ${suggestedAssign.name} (${suggestedAssign.id}) — ${suggestedAssign.color}`);
                                        const useMatchBtn = createElement(doc, 'button', 'menu_button chromatic-dialogue-migration-suggestion-button', 'Use Suggested Match');
                                        useMatchBtn.type = 'button';
                                        useMatchBtn.disabled = busy;
                                        useMatchBtn.addEventListener('click', () => {
                                            controller.setMapping(group.sourceKey, {
                                                action: 'reuse',
                                                assignmentId: group.suggestedAssignmentId,
                                            });
                                            render();
                                        });
                                        suggestionBox.appendChild(suggestionText);
                                        suggestionBox.appendChild(useMatchBtn);
                                        reuseBox.appendChild(suggestionBox);
                                    }
                                }

                                controls.appendChild(reuseBox);
                            } else if (mapping?.action === 'create') {
                                const createBox = createElement(doc, 'div', 'chromatic-dialogue-migration-create-fields');

                                const nameLabel = createElement(doc, 'label', 'chromatic-dialogue-migration-field-label', 'Character name');
                                const nameInputId = `cd-name-${group.sourceKey.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
                                nameLabel.setAttribute('for', nameInputId);

                                const nameInput = createElement(doc, 'input', 'chromatic-dialogue-migration-input');
                                nameInput.type = 'text';
                                nameInput.id = nameInputId;
                                nameInput.value = mapping.name || '';
                                nameInput.placeholder = 'Character name';
                                nameInput.disabled = busy;

                                const colorLabel = createElement(doc, 'label', 'chromatic-dialogue-migration-field-label', 'Final CD color');
                                const colorInputId = `cd-color-${group.sourceKey.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
                                colorLabel.setAttribute('for', colorInputId);

                                const colorInput = createElement(doc, 'input', 'chromatic-dialogue-migration-input');
                                colorInput.type = 'text';
                                colorInput.id = colorInputId;
                                colorInput.value = mapping.color || '';
                                colorInput.placeholder = '#RRGGBB';
                                colorInput.disabled = busy;

                                const draftSwatch = createElement(doc, 'span', 'chromatic-dialogue-migration-swatch');
                                if (HEX_COLOR_REGEX.test(colorInput.value)) {
                                    draftSwatch.style.backgroundColor = colorInput.value;
                                } else {
                                    draftSwatch.hidden = true;
                                }

                                const updateCreateDraft = () => {
                                    controller.setMapping(group.sourceKey, {
                                        action: 'create',
                                        name: nameInput.value,
                                        color: colorInput.value,
                                    });
                                    if (HEX_COLOR_REGEX.test(colorInput.value)) {
                                        draftSwatch.style.backgroundColor = colorInput.value;
                                        draftSwatch.hidden = false;
                                    } else {
                                        draftSwatch.hidden = true;
                                    }
                                    const refreshedState = controller.getState();
                                    progressBox.textContent = `${refreshedState.completedMappingCount} of ${refreshedState.requiredMappingCount} source groups mapped`;
                                    const previewBtn = root.querySelector('.chromatic-dialogue-migration-preview-button');
                                    if (previewBtn) {
                                        previewBtn.disabled = !refreshedState.canPreview || busy;
                                    }
                                };

                                nameInput.addEventListener('input', updateCreateDraft);
                                colorInput.addEventListener('input', updateCreateDraft);

                                createBox.appendChild(nameLabel);
                                createBox.appendChild(nameInput);
                                createBox.appendChild(colorLabel);
                                createBox.appendChild(colorInput);
                                createBox.appendChild(draftSwatch);

                                if (group.suggestedFinalColor) {
                                    const suggestBox = createElement(doc, 'div', 'chromatic-dialogue-migration-suggestion');
                                    const suggestText = createElement(doc, 'span', 'chromatic-dialogue-migration-suggestion-label', `Suggested color: ${group.suggestedFinalColor}`);
                                    const useColorBtn = createElement(doc, 'button', 'menu_button chromatic-dialogue-migration-suggestion-button', 'Use Suggested Color');
                                    useColorBtn.type = 'button';
                                    useColorBtn.disabled = busy;
                                    useColorBtn.addEventListener('click', () => {
                                        controller.setMapping(group.sourceKey, {
                                            action: 'create',
                                            name: nameInput.value,
                                            color: group.suggestedFinalColor,
                                        });
                                        render();
                                    });
                                    suggestBox.appendChild(suggestText);
                                    suggestBox.appendChild(useColorBtn);
                                    createBox.appendChild(suggestBox);
                                }

                                controls.appendChild(createBox);
                            }

                            card.appendChild(controls);
                        }

                        cardsContainer.appendChild(card);
                    }

                    fragments.push(cardsContainer);
                }
            }

            // 5. Preview section
            if (state.preview && state.preview.status === 'ready') {
                const previewSection = createElement(doc, 'div', 'chromatic-dialogue-migration-preview-section');
                const previewHeader = createElement(doc, 'h4', 'chromatic-dialogue-migration-preview-title', 'Migration Preview');
                previewSection.appendChild(previewHeader);

                const pStats = state.preview.stats || {};
                const statsSummary = createElement(doc, 'div', 'chromatic-dialogue-migration-preview-stats');
                const previewStatItems = [
                    { label: 'Changed messages', value: pStats.changedMessageCount ?? state.preview.messageChanges?.length ?? 0 },
                    { label: 'Dialogue spans to migrate', value: pStats.migratedOccurrenceCount ?? 0 },
                    { label: 'Skipped migratable spans', value: pStats.skippedMigratableCount ?? 0 },
                    { label: 'New assignments', value: pStats.newAssignmentCount ?? state.preview.newAssignments?.length ?? 0 },
                    { label: 'Reused assignments', value: pStats.reusedAssignmentCount ?? state.preview.reusedAssignments?.length ?? 0 },
                    { label: 'Unknown colored content', value: pStats.unknownColoredCount ?? 0 },
                    { label: 'Scanner issues', value: pStats.issueCount ?? 0 },
                ];

                for (const item of previewStatItems) {
                    const row = createElement(doc, 'div', 'chromatic-dialogue-migration-preview-stat');
                    row.appendChild(createElement(doc, 'span', 'chromatic-dialogue-migration-preview-stat-label', `${item.label}: `));
                    row.appendChild(createElement(doc, 'strong', 'chromatic-dialogue-migration-preview-stat-value', String(item.value)));
                    statsSummary.appendChild(row);
                }
                previewSection.appendChild(statsSummary);

                // New assignments
                if (Array.isArray(state.preview.newAssignments) && state.preview.newAssignments.length > 0) {
                    const newAssignmentsBox = createElement(doc, 'div', 'chromatic-dialogue-migration-new-assignments');
                    newAssignmentsBox.appendChild(createElement(doc, 'h5', '', 'New Assignments'));
                    const list = createElement(doc, 'ul');
                    for (const a of state.preview.newAssignments) {
                        list.appendChild(createElement(doc, 'li', '', `${a.id} — ${a.name} — ${a.color}`));
                    }
                    newAssignmentsBox.appendChild(list);
                    previewSection.appendChild(newAssignmentsBox);
                }

                // Reused assignments
                if (Array.isArray(state.preview.reusedAssignments) && state.preview.reusedAssignments.length > 0) {
                    const reusedBox = createElement(doc, 'div', 'chromatic-dialogue-migration-reused-assignments');
                    reusedBox.appendChild(createElement(doc, 'h5', '', 'Reused Assignments'));
                    const list = createElement(doc, 'ul');
                    for (const a of state.preview.reusedAssignments) {
                        list.appendChild(createElement(doc, 'li', '', `${a.id} — ${a.name} — ${a.color}`));
                    }
                    reusedBox.appendChild(list);
                    previewSection.appendChild(reusedBox);
                }

                // Source plans
                if (Array.isArray(state.preview.sourcePlans) && state.preview.sourcePlans.length > 0) {
                    const plansBox = createElement(doc, 'div', 'chromatic-dialogue-migration-source-plans');
                    plansBox.appendChild(createElement(doc, 'h5', '', 'Source Plans'));
                    const list = createElement(doc, 'ul');
                    for (const p of state.preview.sourcePlans) {
                        let planDesc = `${p.sourceKey} → ${p.action}`;
                        if (p.action === 'reuse' || p.action === 'create') {
                            planDesc += ` (${p.assignmentId || p.allocatedAssignmentId || ''} — ${p.name || ''} — ${p.color || ''})`;
                        }
                        list.appendChild(createElement(doc, 'li', '', planDesc));
                    }
                    plansBox.appendChild(list);
                    previewSection.appendChild(plansBox);
                }

                // Message changes
                if (Array.isArray(state.preview.messageChanges) && state.preview.messageChanges.length > 0) {
                    const msgChangesBox = createElement(doc, 'div', 'chromatic-dialogue-migration-message-changes');
                    msgChangesBox.appendChild(createElement(doc, 'h5', '', `Exact Message Changes (${state.preview.messageChanges.length})`));

                    const visibleChanges = state.preview.messageChanges.slice(0, previewVisibleCount);
                    for (const mc of visibleChanges) {
                        const details = createElement(doc, 'details', 'chromatic-dialogue-migration-diff-details');
                        const repCount = Array.isArray(mc.replacements) ? mc.replacements.length : 0;
                        const summaryEl = createElement(doc, 'summary', '', `Message ${mc.messageIndex} · ${mc.role} · ${repCount} replacements`);
                        details.appendChild(summaryEl);

                        const diffBox = createElement(doc, 'div', 'chromatic-dialogue-migration-diff-box');
                        diffBox.appendChild(createElement(doc, 'div', 'chromatic-dialogue-migration-diff-label', 'Before:'));
                        diffBox.appendChild(createElement(doc, 'pre', 'chromatic-dialogue-migration-before', mc.before));
                        diffBox.appendChild(createElement(doc, 'div', 'chromatic-dialogue-migration-diff-label', 'After:'));
                        diffBox.appendChild(createElement(doc, 'pre', 'chromatic-dialogue-migration-after', mc.after));
                        details.appendChild(diffBox);

                        msgChangesBox.appendChild(details);
                    }

                    if (state.preview.messageChanges.length > previewVisibleCount) {
                        const pagination = createElement(doc, 'div', 'chromatic-dialogue-migration-pagination');
                        const showMoreBtn = createElement(doc, 'button', 'menu_button chromatic-dialogue-migration-show-more', 'Show 10 More');
                        showMoreBtn.type = 'button';
                        showMoreBtn.addEventListener('click', () => {
                            previewVisibleCount += 10;
                            render();
                        });

                        const showAllBtn = createElement(doc, 'button', 'menu_button chromatic-dialogue-migration-show-all', 'Show All');
                        showAllBtn.type = 'button';
                        showAllBtn.addEventListener('click', () => {
                            previewVisibleCount = state.preview.messageChanges.length;
                            render();
                        });

                        pagination.appendChild(showMoreBtn);
                        pagination.appendChild(showAllBtn);
                        msgChangesBox.appendChild(pagination);
                    }

                    previewSection.appendChild(msgChangesBox);
                }

                fragments.push(previewSection);
            }

            // 6. Action Footer (Sticky)
            const footer = createElement(doc, 'div', 'chromatic-dialogue-migration-actions-footer');

            const previewBtn = createElement(doc, 'button', 'menu_button chromatic-dialogue-migration-preview-button', 'Preview Migration');
            previewBtn.type = 'button';
            previewBtn.disabled = !state.canPreview || busy;
            previewBtn.addEventListener('click', async () => {
                busy = true;
                lastOperation = 'preview';
                render();
                await controller.preview();
                busy = false;
                render();
            });
            footer.appendChild(previewBtn);

            if (state.canApply) {
                const hasChanges =
                    (state.preview?.messageChanges?.length || 0) > 0 ||
                    (state.preview?.newAssignments?.length || 0) > 0;

                if (!hasChanges) {
                    const noChangesNote = createElement(doc, 'span', 'chromatic-dialogue-migration-no-changes-note', 'Nothing will be changed by this plan.');
                    footer.appendChild(noChangesNote);
                } else {
                    const applyBtn = createElement(doc, 'button', 'menu_button chromatic-dialogue-migration-apply-button', 'Apply Migration');
                    applyBtn.type = 'button';
                    applyBtn.disabled = busy;
                    applyBtn.addEventListener('click', async () => {
                        const pStats = state.preview?.stats || {};
                        const msgCount = pStats.changedMessageCount ?? state.preview?.messageChanges?.length ?? 0;
                        const spanCount = pStats.migratedOccurrenceCount ?? 0;
                        const newCount = pStats.newAssignmentCount ?? state.preview?.newAssignments?.length ?? 0;

                        const confirmMsg =
                            `This will rewrite ${msgCount} chat messages and migrate ${spanCount} dialogue spans.\n` +
                            `${newCount} new Chromatic Dialogue assignment(s) will be added.\n\n` +
                            `A session-only Undo Last Migration option will be available if the migration saves successfully.`;

                        const result = await confirmPrompt('Apply Legacy Dialogue Migration?', confirmMsg, {
                            okButton: 'Apply Migration',
                            cancelButton: 'Cancel',
                        });
                        if (result !== context.POPUP_RESULT.AFFIRMATIVE) {
                            return;
                        }

                        busy = true;
                        lastOperation = 'apply';
                        render();
                        await controller.apply();
                        busy = false;
                        render();
                    });
                    footer.appendChild(applyBtn);
                }
            }

            fragments.push(footer);

            root.replaceChildren(...fragments);
        }

        const options = {
            wide: true,
            large: true,
            allowVerticalScrolling: true,
            leftAlign: true,
            animation: 'fast',
            onClosing: () => {
                if (busy) {
                    return false;
                }
                return true;
            },
            onClose: () => {
                isWizardOpen = false;
                activePopup = null;
            },
        };

        activePopup = new context.Popup(root, context.POPUP_TYPE.DISPLAY, '', options);

        try {
            const showPromise = activePopup.show();
            if (showPromise && typeof showPromise.catch === 'function') {
                showPromise.catch(() => {});
            }
        } catch {
            // Safe display fallback
        }

        lastScanResult = controller.scan();
        render();
    }

    /**
     * Handle keyboard and click activation on the Magic Wand action.
     *
     * @param {KeyboardEvent | MouseEvent} event
     */
    function handleActivate(event) {
        if (event.type === 'keydown') {
            if (event.key === ' ' || event.code === 'Space') {
                event.preventDefault();
            } else if (event.key !== 'Enter') {
                return;
            }
        }
        openWizard();
    }

    action.addEventListener('click', handleActivate);
    action.addEventListener('keydown', handleActivate);

    return { status: 'installed' };
}