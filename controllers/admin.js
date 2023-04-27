const Billboard = require('../models/billboard');
const renderError = require('../lib/renderError');

const Admin = {
    billboard: {}
};

// Admin.index = ((req, res) => {
//     res.send('go to /admin/billboard')
// });

Admin.billboard.edit = ((req, res) => {

    Billboard.run()
        .then(billboards => {
            let billboard = billboards[0];

            return res.render('admin/billboard/edit', {billboard});

        })
        .catch((err) => {
            return renderError(err, res);
        })


});

// This code is used to save the contents of the billboard to the database. 
// This code will either create a new billboard or edit an existing one. 
// The code first gets the billboards from the database. 
// If there is a billboard already in the database, then it will edit it. 
// If there is not a billboard in the database, then it will create a new one. 
// Then it will save it and redirect to the homepage.
Admin.billboard.editPost = ((req, res) => {
    const text = req.body.text;
    const enabled = req.body.enabled === 'on';

    Billboard.run()
        .then(billboards => {
            let billboard;
            if (billboards.length) {
                billboard = billboards[0];
            } else {
                billboard = new Billboard({});
            }

            if (text == null || text.length == 0) {
                billboard.text = "";
            } else {
                billboard.text = text;
            }
            billboard.enabled = enabled;

            billboard.save()
                .then(savedBillboard => {
                    res.redirect('/');
                })
                .catch((err) => {
                    return renderError(err, res);
                })
        })
        .catch((err) => {
            return renderError(err, res);
        })
});

module.exports = Admin;