// jsdom has no modal dialogs. These stand in for the two methods the forms use; the real
// behavior (focus kept inside, Escape, focus returned on close) is checked in a browser.
export function stubModalDialogs() {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close() {
    if (!this.hasAttribute('open')) return;
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
}
