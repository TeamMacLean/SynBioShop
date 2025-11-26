import $ from "jquery";
import React, { Component } from "react";
import ReactDOM from "react-dom";

Array.prototype.move = function (old_index, new_index) {
  if (new_index >= this.length) {
    var k = new_index - this.length;
    while (k-- + 1) {
      this.push(undefined);
    }
  }
  this.splice(new_index, 0, this.splice(old_index, 1)[0]);
  return this;
};

function updatePositions(array) {
  return array.map(function (a, i) {
    return (a.position = i);
  });
}

class ReorderButtons extends Component {
  onClick(amount) {
    this.props.action(amount);
  }

  render() {
    return (
      <div className="inline">
        <button className="inline small" onClick={() => this.onClick(-1)}>
          <span data-icon="&#x32;" />
        </button>
        <button className="inline small" onClick={() => this.onClick(1)}>
          <span data-icon="&#x33;" />
        </button>
      </div>
    );
  }
}

class DB extends Component {
  constructor(props) {
    super(props);
    this.state = {
      dbs: props.dbs ? props.dbs.sort((a, b) => a.position - b.position) : [],
      categories: props.categories
        ? props.categories.sort((a, b) => a.position - b.position)
        : [],
    };
  }

  onReorder = (amount) => {
    this.props.move(this.props.index, amount);
  };

  moveCategory = (index, amount) => {
    var mod = this.state.categories;
    if (index + amount < mod.length && index + amount > -1) {
      mod.move(index, index + amount);
      updatePositions(mod);
      this.setState({ categories: mod });
    }
  };

  render() {
    return (
      <div className="db">
        <h2>
          {this.props.name} <ReorderButtons action={this.onReorder} />
        </h2>
        <div className="indent">
          <div data-id={this.props.id}>
            {this.state.categories.map((item, i) => {
              return (
                <Category
                  id={item.id}
                  name={item.name}
                  key={item.id}
                  index={i}
                  move={this.moveCategory}
                  items={item.items}
                />
              );
            })}
          </div>
        </div>
      </div>
    );
  }
}

class Category extends Component {
  constructor(props) {
    super(props);
    this.state = {
      items: props.items
        ? props.items.sort((a, b) => a.position - b.position)
        : [],
    };
  }

  onReorder = (amount) => {
    this.props.move(this.props.index, amount);
  };

  moveItem = (index, amount) => {
    var mod = this.state.items;
    if (index + amount < mod.length && index + amount > -1) {
      mod.move(index, index + amount);
      updatePositions(mod);
      this.setState({ items: mod });
    }
  };

  render() {
    return (
      <div className="indent">
        <div data-id={this.props.id}>
          {this.props.name} <ReorderButtons action={this.onReorder} />
        </div>
        <div className="indent">
          <div data-id={this.props.id}>
            {this.state.items.map((item, i) => {
              return (
                <Item
                  id={item.id}
                  name={item.name}
                  key={item.id}
                  index={i}
                  move={this.moveItem}
                />
              );
            })}
          </div>
        </div>
      </div>
    );
  }
}

class Item extends Component {
  constructor(props) {
    super(props);
    this.state = {
      items: props.items
        ? props.items.sort((a, b) => a.position - b.position)
        : [],
    };
  }

  onReorder = (amount) => {
    this.props.move(this.props.index, amount);
  };

  render() {
    return (
      <div className="indent">
        <div data-id={this.props.id}>
          {this.props.name} <ReorderButtons action={this.onReorder} />
        </div>
      </div>
    );
  }
}

class App extends Component {
  constructor(props) {
    super(props);
    this.state = {
      dbs: props.dbs.sort((a, b) => a.position - b.position),
      saving: false,
    };
  }

  save = () => {
    // Set saving state to show loading overlay
    this.setState({ saving: true });

    var POST_URL = "/premade/rearrange";

    var dataJSON = JSON.stringify(this.state.dbs);

    $.post(POST_URL, { newOrder: dataJSON })
      .done(() => {
        // Redirect to /premade page after successful save
        window.location.href = "/premade";
      })
      .fail((resData) => {
        console.error("error", resData);
        this.setState({ saving: false });
        alert("Failed to save arrangement. Please try again.");
      });
  };

  move = (index, amount) => {
    var mod = this.state.dbs;
    if (index + amount < mod.length && index + amount > -1) {
      mod.move(index, index + amount);
      updatePositions(mod);
      this.setState({ dbs: mod });
    }
  };

  render() {
    return (
      <div>
        {this.state.saving && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(255, 255, 255, 0.9)",
              zIndex: 9999,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "24px",
              fontWeight: "bold",
            }}
          >
            <div
              style={{
                width: "60px",
                height: "60px",
                border: "6px solid #f3f3f3",
                borderTop: "6px solid #3498db",
                borderRadius: "50%",
                animation: "spin 1s linear infinite",
                marginBottom: "20px",
              }}
            ></div>
            <div>Saving arrangement...</div>
            <div
              style={{
                fontSize: "16px",
                fontWeight: "normal",
                marginTop: "10px",
                color: "#666",
              }}
            >
              Please wait, this may take up to 10 seconds
            </div>
          </div>
        )}
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
        <div className="simon-list">
          <button
            className="button primary"
            onClick={this.save}
            disabled={this.state.saving}
          >
            Save Arrangement
          </button>
          <hr />
          {this.state.dbs.map((item, i) => {
            return (
              <DB
                id={item.id}
                name={item.name}
                dbs={item.dbs}
                categories={item.categories}
                key={item.id}
                index={i}
                isRoot={true}
                move={this.move}
              />
            );
          })}
          <hr />
          <button
            className="button primary"
            onClick={this.save}
            disabled={this.state.saving}
          >
            Save Arrangement
          </button>
        </div>
      </div>
    );
  }
}

ReactDOM.render(<App dbs={dbs} />, document.getElementById("app"));
