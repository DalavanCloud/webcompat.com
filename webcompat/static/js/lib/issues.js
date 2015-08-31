/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var issues = issues || {};
issues.events = _.extend({},Backbone.Events);

if (!window.md) {
  window.md = window.markdownit({
    breaks: true,
    html: true,
    linkify: true
  }).use(window.markdownitSanitizer).use(window.markdownitEmoji);
}

issues.TitleView = Backbone.View.extend({
  el: $('.wc-IssueDetail-title'),
  events: {
    'click .js-linkBack': 'goBack'
  },
  template: _.template($('#title-tmpl').html()),
  render: function() {
    document.title = "Issue " + this.model.get('number') +
                     ": " + this.model.get('title') +
                     " - webcompat.com";
    this.$el.html(this.template(this.model.toJSON()));
    return this;
  },
  goBack: function(e) {
    if (!('origin' in location)) {
      location.origin = location.protocol + '//' + location.host;
    }

    // Only go back in history if we came from the /issues page and there's
    // actually some history to go back to
    if ((document.referrer.indexOf(location.origin + '/issues') === 0) &&
        (history.length !== 1)) {
      history.back();
      e.preventDefault();
    } else {
      location.href = '/issues';
    }
  }
});

issues.MetaDataView = Backbone.View.extend({
  el: $('.wc-IssueDetail-create'),
  initialize: function() {
    this.model.on('change:issueState', _.bind(function() {
      this.render();
    }, this));
  },
  template: _.template($('#metadata-tmpl').html()),
  render: function() {
    this.$el.html(this.template(this.model.toJSON()));
    return this;
  }
});

issues.BodyView = Backbone.View.extend({
  el: $('.wc-IssueDetail-report'),
  template: _.template($('#issue-info-tmpl').html()),
  initialize: function() {
    this.QrView = new issues.QrView({
      model: this.model
    });
  },
  render: function() {
    this.$el.html(this.template(this.model.toJSON()));
    // hide metadata
    $('.wc-IssueDetail-details')
      .contents()
      .filter(function() {
        //find the bare html comment-ish text nodes
        return this.nodeType === 3 && this.nodeValue.match(/<!--/);
        //and hide them
      }).wrap("<p class='wc-hidden'></p>");
    this.QrView.setElement('.wc-Qr-wrapper').render();
    return this;
  }
});

issues.TextAreaView = Backbone.View.extend({
  el: $('.wc-Comment-text'),
  events: {
    'keydown': 'broadcastChange'
  },
  broadcastChange: _.debounce(function() {
    if ($.trim(this.$el.val())) {
      issues.events.trigger('textarea:content');
    } else {
      issues.events.trigger('textarea:empty');
    }
  }, 250, {maxWait: 1500})
});

issues.ImageUploadView = Backbone.View.extend({
  tagName: 'div',
  className: 'wc-Form-group',
  template: _.template($('#upload-input-tmpl').html()),
  render: function() {
    this.$el.html(this.template()).insertAfter($('textarea'));
    return this;
  },
});

// TODO: add comment before closing if there's a comment.
issues.StateButtonView = Backbone.View.extend({
  el: $('.Button--action'),
  events: {
    'click': 'toggleState'
  },
  hasComment: false,
  mainView: null,
  initialize: function(options) {
    this.mainView = options.mainView;

    issues.events.on('textarea:content', _.bind(function() {
      this.hasComment = true;
      if (this.model.get('state') === 'open') {
        this.$el.text(this.template({state: "Close and comment"}));
      } else {
        this.$el.text(this.template({state: "Reopen and comment"}));
      }
    }, this));

    issues.events.on('textarea:empty', _.bind(function() {
      // Remove the "and comment" text if there's no comment.
      this.render();
    }, this));

    this.model.on('change:state', _.bind(function() {
      this.render();
    }, this));
  },
  template: _.template($('#state-button-tmpl').html()),
  render: function() {
    var buttonText;
    if (this.model.get('state') === 'open') {
      buttonText = "Close Issue";
    } else {
      buttonText = "Reopen Issue";
    }
    this.$el.text(this.template({state: buttonText}));
    return this;
  },
  toggleState: function() {
    if (this.hasComment) {
      this.model.toggleState(_.bind(this.mainView.addNewComment, this.mainView));
    } else {
      this.model.toggleState();
    }
  }
});

issues.MainView = Backbone.View.extend({
  el: $('.js-issue'),
  events: {
    'click .Button--default': 'addNewComment',
    'click': 'closeLabelEditor'
  },
  keyboardEvents: {
    'g': 'githubWarp'
  },
  _supportsFormData: 'FormData' in window,
  initialize: function() {
    $(document.body).addClass('language-html');
    var issueNum = {number: issueNumber};
    this.issue = new issues.Issue(issueNum);
    this.comments = new issues.CommentsCollection([]);
    this.initSubViews();
    this.fetchModels();
  },
  closeLabelEditor: function(e) {
    var target = $(e.target);
    // early return if the editor is closed,
    if (!this.$el.find('.LabelEditor').is(':visible') ||
          // or we've clicked on the button to open it,
         (target[0].nodeName === 'BUTTON' && target.hasClass('LabelEditor-launcher')) ||
           // or clicked anywhere inside the label editor
           target.parents('.LabelEditor').length) {
      return;
    } else {
      this.labels.closeEditor();
    }
  },
  githubWarp: function() {
    var warpPipe = "https://github.com/" + repoPath + "/" + this.issue.get('number');
    return location.href = warpPipe;
  },
  initSubViews: function() {
    var issueModel = {model: this.issue};
    this.title = new issues.TitleView(issueModel);
    this.metadata = new issues.MetaDataView(issueModel);
    this.body = new issues.BodyView(issueModel);
    this.labels = new issues.LabelsView(issueModel);
    this.textArea = new issues.TextAreaView();
    this.imageUpload = new issues.ImageUploadView();
    this.stateButton = new issues.StateButtonView(_.extend(issueModel, {mainView: this}));
  },
  fetchModels: function() {
    var headersBag = {headers: {'Accept': 'application/json'}};
    this.issue.fetch(headersBag).success(_.bind(function() {
      _.each([this.title, this.metadata, this.body, this.labels,
              this.stateButton, this.imageUpload, this],
        function(elm) {
          if (elm === this.imageUpload && this._supportsFormData) {
            elm.render();
          } else {
            elm.render();
            _.each($('.wc-IssueDetail-details code'), function(elm) {
              Prism.highlightElement(elm);
            });
          }
        }
      );

      // If there are any comments, go fetch the model data
      if (this.issue.get('commentNumber') > 0) {
        this.comments.fetch(headersBag).success(_.bind(function() {
          this.addExistingComments();
          this.comments.bind("add", _.bind(this.addComment, this));

          // If there's a #hash pointing to a comment (or elsewhere)
          // scrollTo it.
          if (location.hash !== "") {
            var _id = $(location.hash);
            window.scrollTo(0, _id.offset().top);
          }
        }, this)).error(function() {
          var msg = 'There was an error retrieving issue comments. Please reload to try again.';
          wcEvents.trigger('flash:error', {message: msg, timeout: 2000});
        });
      }
    }, this)).error(function(response) {
      var msg;
      if (response.responseJSON.message === "API call. Not Found") {
        location.href = "/404";
        return;
      } else {
        msg = 'There was an error retrieving the issue. Please reload to try again.';
        wcEvents.trigger('flash:error', {message: msg, timeout: 2000});
      }
    });
  },
  addComment: function(comment) {
    var view = new issues.CommentView({model: comment});
    var commentElm = view.render().el;
    $(".wc-IssueDetail-comment").append(commentElm);
    _.each($(commentElm).find('code'), function(elm){
      Prism.highlightElement(elm);
    });
  },
  addNewComment: function() {
    var form = $('.wc-Comment--form');
    var textarea = $('.wc-Comment-text');
    // Only bother if the textarea isn't empty
    if ($.trim(textarea.val())) {
      var newComment = new issues.Comment({
        avatarUrl: form.data('avatarUrl'),
        body: md.render(textarea.val()),
        commenter: form.data('username'),
        createdAt: moment(new Date().toISOString()).fromNow(),
        commentLinkId: null,
        rawBody: textarea.val()
      });
      this.addComment(newComment);
      // Now empty out the textarea.
      textarea.val('');
      // Push to GitHub
      newComment.save();
    }
  },
  addExistingComments: function() {
    this.comments.each(this.addComment, this);
  },
  render: function() {
    this.$el.fadeIn();
  }
});

//Not using a router, so kick off things manually
new issues.MainView();
