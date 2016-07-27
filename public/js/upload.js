tinymce.PluginManager.add('imageupload', function (editor, url) {

    function upBox() {
        editor.windowManager.open({
            title: 'Upload an image',
            file: '/imageupload',
            width: 350,
            height: 135,
            buttons: [{
                text: 'Upload',
                classes: 'widget btn primary first abs-layout-item',
                disabled: true,
                onclick: 'close'
            },
                {
                    text: 'Close',
                    onclick: 'close'
                }]
        });
    }

    // Add a button that opens a window
    editor.addButton('imageupload', {
        tooltip: 'Upload an image',
        icon: 'image',
        text: 'Upload',
        onclick: upBox
    });

    // Adds a menu item to the tools menu
    editor.addMenuItem('imageupload', {
        text: 'Upload image',
        icon: 'image',
        context: 'insert',
        onclick: upBox
    });
});