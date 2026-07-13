import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const entry = fs.readFileSync(new URL('../index.js', import.meta.url), 'utf8');
const settings = fs.readFileSync(new URL('../src/settings.js', import.meta.url), 'utf8');
const template = fs.readFileSync(new URL('../settings.html', import.meta.url), 'utf8');
const ui = fs.readFileSync(new URL('../src/ui.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../style.css', import.meta.url), 'utf8');

test('the extension has no persistent status strip runtime, setting, template, or styles', () => {
    const source = [entry, settings, template, ui, css].join('\n');

    assert.doesNotMatch(source, /ensureStatusStrip|renderStatusStrip|showStatusStrip/);
    assert.doesNotMatch(source, /sst-strip-enabled|succubus-tracker-strip|sst-chip/);
    assert.doesNotMatch(source, /querySelector\(['"]#send_form['"]\)/);
});

test('drawer tabs support click and keyboard operation with roving focus', () => {
    assert.match(ui, /addEventListener\(['"]click['"]/);
    assert.match(ui, /addEventListener\(['"]keydown['"]/);
    for (const key of ['ArrowLeft', 'ArrowRight', 'Home', 'End']) assert.match(ui, new RegExp(key));
    assert.match(ui, /aria-selected/);
    assert.match(ui, /aria-controls/);
    assert.match(ui, /role="tabpanel"/);
});

test('drawer binds every injected NPC operation and explicit destructive confirmations', () => {
    for (const action of [
        'addNpcAndRebuild', 'renameNpcAndRebuild', 'mergeNpcsAndRebuild',
        'removeNpcAndRebuild', 'restoreSuppressedNpcAndRebuild',
    ]) assert.match(ui, new RegExp(action));
    assert.match(ui, /callGenericPopup\s*\(/);
    assert.match(ui, /okButton:\s*['"]Merge NPCs['"]/);
    assert.match(ui, /okButton:\s*['"]Delete NPC['"]/);
    assert.match(ui, /role="alert"/);
});

test('drawer CSS provides 360px one-column cards and touch-sized controls', () => {
    assert.match(css, /@media\s*\(max-width:\s*600px\)/);
    assert.match(css, /\.sst-control-grid[\s\S]*grid-template-columns:\s*1fr/);
    assert.match(css, /\.sst-form-grid[\s\S]*grid-template-columns:\s*1fr/);
    assert.match(css, /\.sst-activity-list[\s\S]*display:\s*grid/);
    assert.match(css, /\.sst-ledger-list[\s\S]*display:\s*grid/);
    assert.match(css, /min-height:\s*44px/);
    assert.match(css, /min-width:\s*44px/);
    assert.doesNotMatch(ui, /<table|<thead|<tbody|<tr|<td/i);
});

test('state drawer popup enables vertical scrolling for mobile content', () => {
    assert.match(ui, /new ctx\.Popup\([\s\S]*allowVerticalScrolling:\s*true/);
});

test('drawer CSS makes keyboard focus visible and disables decorative motion on request', () => {
    assert.match(css, /:focus-visible/);
    assert.match(css, /outline:\s*2px\s+solid\s+var\(--SmartThemeQuoteColor\)/);
    assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
    assert.match(css, /animation-duration:\s*0\.01ms/);
    assert.match(css, /transition-duration:\s*0\.01ms/);
    assert.doesNotMatch(css, /gradient\s*\(|url\s*\(/i);
});

test('settings retain global controls under the Hunger Tracker identity', () => {
    assert.match(template, />Hunger Tracker\s*<small id="sst-extension-version"/);
    assert.match(template, /id="sst-enabled"/);
    assert.match(template, /id="sst-analyzer-profile"/);
    assert.match(template, /id="sst-open-state"/);
    assert.doesNotMatch(template, /Succubus State Tracker/);
});

test('settings HTML escapes profile identifiers and configurable rule values', () => {
    assert.match(ui, /data-profile-enabled="\$\{esc\(profile\.id\)\}"/);
    assert.match(ui, /data-remove-profile="\$\{esc\(profile\.id\)\}"/);
    assert.match(ui, /<option value="\$\{esc\(profile\.id\)\}"/);
    assert.match(ui, /data-event-key="\$\{esc\(key\)\}"/);
    assert.match(ui, /value="\$\{esc\(value\)\}"/);
});
