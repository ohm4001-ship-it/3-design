mergeInto(LibraryManager.library, {
  PokeLabInstallClipboardBridge: function (objectNamePtr) {
    Module.pokeLabClipboardTarget = UTF8ToString(objectNamePtr);
    if (Module.pokeLabClipboardBridgeInstalled) return;
    Module.pokeLabClipboardBridgeInstalled = true;
    document.addEventListener('paste', function (event) {
      var canvas = Module.canvas || document.getElementById('unity-canvas') || document.querySelector('canvas');
      if (!canvas || document.activeElement !== canvas || !event.clipboardData) return;
      var text = event.clipboardData.getData('text/plain');
      if (!text) return;
      SendMessage(Module.pokeLabClipboardTarget, 'OnBrowserPaste', text.slice(0, 20000));
      event.preventDefault();
    });
  },
  PokeLabSyncSave: function (objectNamePtr) {
    var objectName = UTF8ToString(objectNamePtr);
    FS.syncfs(false, function (error) {
      if (error) {
        console.warn('PokeLab save could not be persisted.', error);
        SendMessage(objectName, 'OnWebStorageError', String(error));
      }
    });
  },
  PokeLabDownloadJson: function (namePtr, contentPtr) {
    var name = UTF8ToString(namePtr);
    var content = UTF8ToString(contentPtr);
    var blob = new Blob([content], { type: 'application/json;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
  }
});
