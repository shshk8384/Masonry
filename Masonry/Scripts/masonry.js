﻿/// <reference path="jquery-1.8.2.js" />
/// <reference path="bootstrap.js" />
/// <reference path="knockout-2.2.0.js" />
/// <reference path="moment.js" />

function isNullOrWhiteSpace(str) {
  return str === null || str.match(/^ *$/) !== null;
}

/*
  jQuery plugin: Twitter-like dynamic character countdown for textareas

   Example:

      $('#textarea').countdown({
        limit: 140,
        init: function(counter){
          $('#counter').css('color','#999999').val(counter);
          $('#submit').attr('disabled','disabled');
        },
        plus: function(counter){
          $('#counter').css('color','#999999').val(counter);
          $('#submit').removeAttr('disabled');
        },
        minus: function(counter){
          $('#counter').css('color','red').val(counter);
          $('#submit').attr('disabled','disabled');
        }
      });
*/

(function($) {
  $.fn.countdown = function(config) {
    var options = $.extend($.fn.countdown.defaults, config);
    
    function updateUi(sender) {
      var available = options.limit - $(sender).val().length;
      var counter = options.prefix + available + options.suffix;
      if (counter >= 0)
        options.plus(counter);
      else
        options.minus(counter);
    }

    updateUi($(this));

    return this.each(function () {

      $(this).bind("keyup change", function() {
        if (!$(this).val().length) {
          options.init(options.limit);
          return;
        }
        updateUi($(this));
      });
    });
  };

  $.fn.countdown.defaults = {
    limit: 160,
    init: function (counter) { },
    plus: function (counter) { },
    minus: function (counter) { },
    prefix: '',
    suffix: ''
  };
})(jQuery);

String.prototype.formatString = function() {
  var formatted = this;
  for (var i = 0; i < arguments.length; i++) {
    var regexp = new RegExp('\\{' + i + '\\}', 'gi');
    formatted = formatted.replace(regexp, arguments[i]);
  }
  return formatted;
};

String.prototype.parseUrls = function () {
  return this.replace(/[A-Za-z]+:\/\/[A-Za-z0-9-_]+\.[A-Za-z0-9-_:%&~\?\/.=]+/g, function (url) {
    return url.link(url);
  });
};

String.prototype.parseHashTags = function () {
  return this.replace(/[#]+[A-Za-z0-9-_]+/g, function (t) {
    var tag = t.replace("#", "%23");
    //return t.link("http://search.twitter.com/search?q=" + tag);
    return t.link($.resolvePath("/Search?q=" + tag));
  });
};

String.prototype.parseAccountTags = function () {
  return this.replace(/[@]+[A-Za-z0-9-_]+/g, function (u) {
    var username = u.replace("@", "");
    //return u.link("http://twitter.com/" + username);
    return "<a href='" + $.resolvePath("/Timeline/Feed?uid=" + username) + "' data-link-type='account' data-link-value='" + username + "'>" + u + "</a>";
  });
};

String.prototype.getHashTags = function () {
  var result = this.match(/[#]+[A-Za-z0-9-_]+/g);
  return result ? result : [];
};

String.prototype.twitterize = function () {
  return this
    .parseUrls()
    .parseAccountTags()
    .parseHashTags();
};

// ========================================================================================
// View Models
// ========================================================================================

function PostViewModel(data) {
  var self = this;
  self.id = data.Id;
  self.account = data.Account;
  self.name = data.Name;
  self.content = data.Content.twitterize();
  self.created = moment(data.CreatedUtc);
  self.hashtags = data.Content.getHashTags();
  self.picture = $.resolvePath("/Account/PictureSmall?uid=" + data.Account);
  self.feed = $.resolvePath("/Timeline/Feed?uid=" + data.Account);
  self.canDismiss = false;
  self.postUrl = $.resolvePath("/Timeline/Post?pid=" + data.Id);

  self.commentsCount = ko.observable(data.CommentsCount);
  self.comments = ko.observableArray([]);
  self.commentsLoading = ko.observable(false);
  self.commentsLoaded = false;
  self.openBlank = false;

  // sorts comments by creation date in descending order
  self.sortComments = function () {
    self.comments.sort(function (left, right) {
      var result = left.created == right.created ? 0 : (left.created < right.created ? -1 : 1);
      return result;
    });
  };
}

function FeedViewModel(account, data) {
  var self = this;

  self.account = account;
  self.posts = ko.observableArray([]);

  self.removePost = function (post) {
    $.ajax({
      url: $.resolvePath("/Timeline/DeletePost?id=" + post.id),
      dataType: 'json',
      success: function (result) {
        if (result == true) {
          self.posts.remove(post);
          // Raise event to notify external components
          $(document).trigger("masonry.onPostRemoved", data);
        }
      }
    });
  };

  self.addNewPost = function (post) {
    var viewmodel = new PostViewModel(post);
    viewmodel.canDismiss = (post.Account == account);
    self.posts.unshift(viewmodel);
  };

  self.addPost = function (post) {
    var viewmodel = new PostViewModel(post);
    viewmodel.canDismiss = (post.Account == account);

    if (post.Comments && post.Comments.length > 0) {
      $(post.Comments).each(function (index, entry) {
        viewmodel.comments.push(new PostViewModel({
          Account: entry.Account,
          Name: entry.Name,
          Content: entry.Content,
          CreatedUtc: entry.CreatedUtc
        }));
      });

      viewmodel.commentsLoaded = true;
    }

    viewmodel.openBlank = viewmodel.commentsLoaded == false && viewmodel.commentsCount() > 9;
    self.posts.push(viewmodel);
  };

  self.appendPosts = function (posts) {
    $(posts).each(function (index, entry) {
      self.addPost(entry);
    });
  };

  self.appendPosts(data);
}

function UserProfileViewModel(data) {
  var self = this;
  self.account = data.Account;
  self.name = data.Name;
  self.website = data.Website;
  self.bio = data.Bio;
  self.posts = data.Posts;
  self.followers = data.Followers;
  self.followersUrl = $.resolvePath("/People/Followers?uid=" + data.Account);
  self.following = data.Following;
  self.followingUrl = $.resolvePath("/People/Following?uid=" + data.Account);
  self.isFollowed = data.IsFollowed;
  self.picture = $.resolvePath("/Account/PictureSmall?uid=" + data.Account);
  self.feed = $.resolvePath("/Timeline/Feed?uid=" + data.Account);
  self.followAction = $.resolvePath("/People/Follow?uid=" + data.Account);
  self.unfollowAction = $.resolvePath("/People/Unfollow?uid=" + data.Account);
  self.isOwnProfile = data.IsOwnProfile;
}

function PeopleViewModel(data) {
  var self = this;
  self.profiles = ko.observableArray([]);

  self.appendItems = function (items) {
    $(items).each(function (index, entry) {
      var viewmodel = new UserProfileViewModel(entry);
      self.profiles.push(viewmodel);
    });
  };

  self.appendItems(data);
}

// ========================================================================================
// Functions
// ========================================================================================

function onPeopleDataLoaded(data) {
  if (!window.peopleFeed) {
    window.peopleFeed = new PeopleViewModel(data);
    ko.applyBindings(window.peopleFeed);
  }
  else {
    window.peopleFeed.appendItems(data);
  }
}

// ========================================================================================
// Account link tooltips
// ========================================================================================

function enableAccountTooltips() {
  $('a[data-link-type="account"]').each(function () {
    var link = $(this);
    link.popover({
      placement: 'right',
      trigger: 'hover',
      title: '@' + link.attr("data-link-value"),
      delay: 600,
      content: 'Show status updates posted by this user.'
    });
  });
}

// ========================================================================================
// Comment expanders
// ========================================================================================

function enableCommentExpanders() {
  $('div[data-link-type="comment"]').each(function () {
    var link = $(this);
    link
      .unbind("shown", onCommentsExpanded)
      .bind("shown", onCommentsExpanded);
  });
}

function onCommentsExpanded() {
  var sender = $(this);
  var post = ko.dataFor(sender[0]);
  loadComments(post);
}

function loadComments(post) {
  if (!post.commentsLoading()) {
    post.commentsLoading(true);
    $.ajax({
      url: $.resolvePath("/Timeline/Comments/" + post.id),
      dataType: "json",
      success: function (data) {
        onCommentsLoaded(post, data);
      }
    });
  }
}

function onCommentsLoaded(post, data) {
  post.commentsLoading(false);
  // TODO: provide latest comment date/id in order for server returning only delta 
  post.comments.removeAll();
  if (data) {
    post.commentsCount(data.length);
    // turn comments into PostViewModel instances (as per current design)
    $(data).each(function(index, entry) {
      post.comments.push(new PostViewModel({
        Account: entry.Account,
        Name: entry.Name,
        Content: entry.Content,
        CreatedUtc: entry.CreatedUtc
      }));
    });

    // TODO: temp
    enableAccountPopups();
    enableAccountTooltips();
  }
}

function onCommentPosted(data, status, response) {
  var editor = $("#comment-box-" + data.PostId);
  var post = ko.dataFor(editor[0]);

  post.commentsCount(post.commentsCount() + 1);
  // turn comments into PostViewModel instances (as per current design)
  post.comments.push(new PostViewModel({
    Account: data.Account,
    Name: data.Name,
    Content: data.Content,
    CreatedUtc: data.CreatedUtc
  }));

  // TODO: temp
  enableAccountPopups();
  enableAccountTooltips();

  post.sortComments();
  editor.val("");
}

// ========================================================================================
// Account image popovers
// ========================================================================================

var isPopupVisible = false;
var clickedAway = false;
var openedPopup;

function enableAccountPopups() {

  // rebind clickaway subscribers
  $(document)
    .unbind("click touchend", onAccountPopupClickedAway)
    .bind("click touchend", onAccountPopupClickedAway);

  //var elements = (!target)
  //  ? $("img[data-link-type='account']")
  //  : $(target).find("img[data-link-type='account']");

  var elements = $("img[data-link-type='account']");

  elements.each(function () {
    var img = $(this);

    var imgId = img.attr("id");
    img.popover({
      html: true,
      title: function () { return $("#" + imgId).attr("data-link-value"); },
      content: function () { return $(this).data("data-popover-data").html; },
      trigger: 'manual'
    }).unbind("click touchend", onAccountPopupClick)
      .bind("click touchend", onAccountPopupClick);
  });
}

function onAccountPopupClick(e) {
  e.preventDefault();
  var sender = $(this);
  var senderId = sender.attr("id");

  if (openedPopup != senderId) {
    $("#" + openedPopup).popover("hide");

    sender.data("data-popover-data", {
      isLoading: false,
      html: "<div style='text-align:center;'><img src='" + $.resolvePath("/Content/images/facebook-loading.gif") + "' /></div>"
    });

    sender.popover("show");
    openedPopup = senderId;
    isPopupVisible = true;

    var account = sender.attr("data-link-value");
    var profile = sender.data("data-popover-data");

    if (!profile.isLoading) {
      profile.isLoading = true;
      requestProfile(senderId, account, profile, onUserProfileFetched);
    }
  }

  clickedAway = false;
}

function requestProfile(senderId, account, profile, success) {
  $.ajax({
    url: $.resolvePath("/Account/PublicProfile?uid=" + account),
    contentType: 'application/html; charset=utf-8',
    dataType: 'html',
    success: function (data) { success(senderId, data, profile); }
  });
}

function onUserProfileFetched(senderId, data, profile) {
  profile.isLoading = false;
  profile.html = data;

  // this is async invoke so we need to ensure that this particular popup is still opened
  if (openedPopup == senderId) {
    $('#' + senderId).popover('show'); // rebind opened view
  }
}

function onAccountPopupClickedAway() {
  if (isPopupVisible & clickedAway) {
    if (openedPopup) {
      $("#" + openedPopup).popover('hide');
      openedPopup = null;
    }
    isPopupVisible = clickedAway = false;
  }
  else {
    clickedAway = true;
  }
}

// ========================================================================================
// Smooth/infinite loading
// ========================================================================================

var _page = 0;
var _inCallback = false;

function initLazyLoading(url, onSuccess) {
  $(window).scroll(function () {
    if ($(window).scrollTop() == $(document).height() - $(window).height()) {
      if (_page > -1 && !_inCallback) {
        _inCallback = true;
        _page++;
        
        $("#page-data-loading").show();
        $("#content-loading-error").hide();

        $.ajax({
          type: "GET",
          dataType: "json",
          url: url(_page),
          timeout: 5000,
          success: function (data, textStatus) {
            // check whether any posts are loaded
            if (data.length > 0) {
              if (onSuccess && (typeof onSuccess == "function")) {
                onSuccess(data);
              }
            }
            else {
              // otherwise stop further attempts loading data as we reached the end
              _page = -1;
            }
          },
          error: function (request, status, error) {
            $("#content-loading-error").text("Error getting data. There seems to be a server problem, please try again later.");
            $("#content-loading-error").show();
            _page--;
          },
          complete: function (request, status) {
            _inCallback = false;
            $("#page-data-loading").hide();
          }
        });
      }
    }
  });
}

// ========================================================================================
// UI
// ========================================================================================

// Controls selection state of navbar items
function updateSidebarSelection(navigationPath) {
  var toSelect = $('#' + navigationPath);

  $('#sidebar > li').removeClass('active');
  $('#sidebar > li i').removeClass('icon-white');
  $('#sidebar > li span.badge').removeClass('badge-inverse');

  if (toSelect.length > 0) {
    toSelect.addClass('active');
    $('#' + navigationPath + ' i').addClass('icon-white');
    $('#' + navigationPath + ' span.badge').addClass('badge-inverse');
  }
}