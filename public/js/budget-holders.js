(function () {
  'use strict';
  const failureToggle = document.getElementById('budget-toggle-failures');
  if (failureToggle) {
    const olderFailures = document.getElementById('budget-older-failures');
    const moreLabel = failureToggle.textContent;
    failureToggle.addEventListener('click', function () {
      olderFailures.hidden = !olderFailures.hidden;
      failureToggle.setAttribute(
        'aria-expanded',
        String(!olderFailures.hidden)
      );
      failureToggle.textContent = olderFailures.hidden
        ? moreLabel
        : 'Show less';
    });
  }
  const form = document.getElementById('budget-selections');
  if (!form) return;
  const groups = Array.from(form.querySelectorAll('.budget-institute'));
  const footer = document.getElementById('budget-save-footer');
  const errorBox = document.getElementById('budget-save-error');
  const refreshForm = document.getElementById('budget-refresh');
  const saveButton = document.getElementById('budget-save');
  const discardButton = document.getElementById('budget-discard');
  const bulkInstitutes = new Set();
  const saved = new Map();
  const toast = document.querySelector('.budget-toast');
  if (toast)
    setTimeout(function () {
      toast.remove();
    }, 6000);
  const devBanner = document.getElementById('dev-mode-banner');
  if (devBanner)
    footer.style.bottom = `${devBanner.getBoundingClientRect().height}px`;
  let dirty = false;
  let leaving = false;
  let saving = false;
  const editable = Array.from(
    form.querySelectorAll('.budget-holder-checkbox, .budget-default')
  );
  editable.forEach(function (input) {
    saved.set(input, input.checked);
  });

  function members(group) {
    return Array.from(group.querySelectorAll('.budget-holder-checkbox'));
  }

  function update() {
    let changes = 0;
    editable.forEach(function (input) {
      if (input.checked !== saved.get(input)) changes++;
    });
    dirty = changes > 0;
    footer.hidden = !dirty;
    document.getElementById('budget-change-count').textContent =
      `${changes} unsaved change${changes === 1 ? '' : 's'}`;
    groups.forEach(function (group) {
      const checkboxes = members(group);
      const enabled = checkboxes.filter(function (input) {
        return input.checked;
      }).length;
      const status = group.querySelector('.budget-display-status');
      const displayed = enabled > 0;
      status.classList.toggle('is-displayed', displayed);
      status.querySelector('.budget-display-icon').textContent = displayed
        ? '✓'
        : '✕';
      status.querySelector('.budget-display-label').textContent = displayed
        ? 'Displays'
        : 'Does not display';
      group.querySelector('.budget-count').textContent =
        `${enabled} of ${checkboxes.length} enabled`;
      group.querySelector('.budget-enable-all').disabled =
        saving || enabled === checkboxes.length;
      group.querySelector('.budget-disable-all').disabled =
        saving || enabled === 0;
    });
  }

  function setAll(group, enabled) {
    const checkboxes = members(group);
    const selected = checkboxes.filter(function (input) {
      return input.checked;
    }).length;
    if (selected > 0 && selected < checkboxes.length) {
      const name = group.dataset.institute;
      const confirmed = window.confirm(
        `${name} has ${selected} of ${checkboxes.length} holders enabled individually. ` +
          `${enabled ? 'Enable' : 'Disable'} all and set new holders ${enabled ? 'enabled' : 'disabled'} by default? ` +
          'This will replace the current individual exceptions. Changes take effect only when saved.'
      );
      if (!confirmed) {
        update();
        return;
      }
    }
    checkboxes.forEach(function (input) {
      input.checked = enabled;
    });
    group.querySelector('.budget-default').checked = enabled;
    bulkInstitutes.add(group.dataset.institute);
    update();
  }

  groups.forEach(function (group) {
    const disclosure = group.querySelector('.budget-disclosure');
    const panel = document.getElementById(
      disclosure.getAttribute('aria-controls')
    );
    disclosure.addEventListener('click', function () {
      panel.hidden = !panel.hidden;
      disclosure.setAttribute('aria-expanded', String(!panel.hidden));
    });
    group
      .querySelector('.budget-enable-all')
      .addEventListener('click', function () {
        setAll(group, true);
      });
    group
      .querySelector('.budget-disable-all')
      .addEventListener('click', function () {
        setAll(group, false);
      });
    group
      .querySelector('.budget-default')
      .addEventListener('change', function () {
        bulkInstitutes.delete(group.dataset.institute);
        update();
      });
    members(group).forEach(function (input) {
      input.addEventListener('change', function () {
        bulkInstitutes.delete(group.dataset.institute);
        update();
      });
    });
  });

  discardButton.addEventListener('click', function () {
    editable.forEach(function (input) {
      input.checked = saved.get(input);
    });
    bulkInstitutes.clear();
    errorBox.hidden = true;
    update();
  });

  function setSaving(value) {
    saving = value;
    editable.forEach(function (input) {
      input.disabled = value;
    });
    saveButton.disabled = value;
    discardButton.disabled = value;
    refreshForm.querySelector('button').disabled = value;
    saveButton.textContent = value ? 'Saving…' : 'Save changes';
    update();
  }

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    if (!dirty || saving) return;
    const payload = {
      revision: Number(form.dataset.revision),
      holders: [],
      institutes: [],
      bulkInstitutes: Array.from(bulkInstitutes),
    };
    groups.forEach(function (group) {
      payload.institutes.push({
        name: group.dataset.institute,
        defaultEnabled: group.querySelector('.budget-default').checked,
      });
      members(group).forEach(function (input) {
        payload.holders.push({ id: input.dataset.id, enabled: input.checked });
      });
    });
    document.getElementById('budget-selection-payload').value =
      JSON.stringify(payload);
    const body = new URLSearchParams(new FormData(form));
    errorBox.hidden = true;
    setSaving(true);
    try {
      const response = await fetch(form.action, {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body,
      });
      if (response.redirected)
        throw new Error(
          'Your session may have expired. Sign in again before saving.'
        );
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.error || 'Could not save your changes. Please try again.'
        );
      leaving = true;
      window.location.assign(result.redirect);
    } catch (error) {
      errorBox.textContent =
        error.message || 'Could not save your changes. Please try again.';
      errorBox.hidden = false;
      errorBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setSaving(false);
    }
  });

  refreshForm.addEventListener('submit', function (event) {
    if (
      saving ||
      (dirty &&
        !window.confirm(
          'Discard your unsaved selection changes and refresh the intranet list?'
        ))
    ) {
      event.preventDefault();
      return;
    }
    leaving = true;
    const button = refreshForm.querySelector('button');
    button.disabled = true;
    button.textContent = 'Refreshing…';
  });
  window.addEventListener('beforeunload', function (event) {
    if (dirty && !leaving) {
      event.preventDefault();
      event.returnValue = '';
    }
  });
  update();
})();
