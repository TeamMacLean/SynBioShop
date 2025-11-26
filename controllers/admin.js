const Billboard = require("../models/billboard");
const renderError = require("../lib/renderError");
const Flash = require("../lib/flash");

const Admin = {
  billboard: {},
};

Admin.billboard.edit = (req, res) => {
  Billboard.run()
    .then((billboards) => {
      let billboard = billboards[0] || null;

      return res.render("admin/billboard/edit", { billboard });
    })
    .catch((err) => {
      console.error("Error loading billboard:", err);
      return renderError(err, res);
    });
};

// This code is used to save the contents of the billboard to the database.
// This code will either create a new billboard or edit an existing one.
Admin.billboard.editPost = (req, res) => {
  const text = req.body.text;
  const enabled = req.body.enabled === "on";

  Billboard.run()
    .then((billboards) => {
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

      billboard
        .save()
        .then((savedBillboard) => {
          // Add success flash message
          Flash.success(
            req,
            `Billboard ${enabled ? "enabled" : "disabled"} and saved successfully!`,
          );

          // Redirect back to billboard edit page instead of home
          res.redirect("/admin/billboard");
        })
        .catch((err) => {
          console.error("Error saving billboard:", err);
          Flash.error(req, "Failed to save billboard. Please try again.");
          return renderError(err, res);
        });
    })
    .catch((err) => {
      console.error("Error loading billboard:", err);
      Flash.error(req, "Failed to load billboard. Please try again.");
      return renderError(err, res);
    });
};

module.exports = Admin;
