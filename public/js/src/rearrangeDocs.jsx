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

class Subject extends Component {
  constructor(props) {
    super(props);
    this.state = {
      subjects: props.subjects
        ? props.subjects.sort((a, b) => a.position - b.position)
        : [],
      documents: props.documents
        ? props.documents.sort((a, b) => a.position - b.position)
        : [],
    };
  }

  onReorder = (amount) => {
    this.props.move(this.props.index, amount);
  };

  moveDocument = (index, amount) => {
    var mod = this.state.documents;
    if (index + amount < mod.length && index + amount > -1) {
      mod.move(index, index + amount);
      updatePositions(mod);
      this.setState({ documents: mod });
    }
  };

  moveSubject = (index, amount) => {
    var mod = this.state.subjects;
    if (index + amount < mod.length && index + amount > -1) {
      mod.move(index, index + amount);
      updatePositions(mod);
      this.setState({ subjects: mod });
    }
  };

  render() {
    return (
      <div className="subject">
        <h2>
          {this.props.name} <ReorderButtons action={this.onReorder} />
        </h2>
        <div className="indent">
          <div data-id={this.props.id}>
            {this.state.documents.map((item, i) => {
              return (
                <Document
                  id={item.id}
                  name={item.name}
                  key={item.id}
                  index={i}
                  move={this.moveDocument}
                />
              );
            })}

            {this.state.subjects.map((item, i) => {
              return (
                <Subject
                  id={item.id}
                  name={item.name}
                  subjects={item.subjects}
                  documents={item.documents}
                  key={item.id}
                  isRoot={false}
                  index={i}
                  move={this.moveSubject}
                />
              );
            })}
          </div>
        </div>
      </div>
    );
  }
}

class Document extends Component {
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
      subjects: props.subjects.sort((a, b) => a.position - b.position),
      saving: false,
    };
  }

  save = () => {
    // Set saving state to show loading overlay
    this.setState({ saving: true });

    var POST_URL = "/docs/rearrange";

    var dataJSON = JSON.stringify(this.state.subjects);

    $.post(POST_URL, { newOrder: dataJSON })
      .done(() => {
        // Redirect to /docs page after successful save
        window.location.href = "/docs";
      })
      .fail((resData) => {
        console.error("error", resData);
        this.setState({ saving: false });
        alert("Failed to save arrangement. Please try again.");
      });
  };

  move = (index, amount) => {
    var mod = this.state.subjects;
    if (index + amount < mod.length && index + amount > -1) {
      mod.move(index, index + amount);
      updatePositions(mod);
      this.setState({ subjects: mod });
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
          {this.state.subjects.map((item, i) => {
            return (
              <Subject
                id={item.id}
                name={item.name}
                subjects={item.subjects}
                documents={item.documents}
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

ReactDOM.render(<App subjects={subjects} />, document.getElementById("app"));
