"use strict";

const toggles = {};

function Toggle(arg) {
    this.key = arg.key;
    this.state = (arg.init ? true : false);
    this.setState = arg.setState;
    this.checkbox = (arg.checkbox == undefined) ? ('#' + this.key + '_cb') : null;
    this.display = arg.display;
    this.container = arg.container;
    this.button = arg.button || this.checkbox;

    toggles[this.key] = this;

    this.init();
}

Toggle.prototype.init = function() {
    if (this.container) {
        jQuery(this.container).append((
            '<div class="settingsOptionContainer">'
            + '<div class="settingsCheckbox" id="' + this.key + '_cb' + '"></div>'
            + '<div class="settingsText">' + this.display + '</div>'
            + '</div>'));
    }

    if (this.button) {
        jQuery(this.button).on('click', () => {this.toggle()});
    }

    if (loStore[this.key] == 'true')
        this.state = true;
    if (loStore[this.key] == 'false')
        this.state = false

    this.toggle(this.state, true);
}

Toggle.prototype.toggle = function(override, init) {
    if (override == true)
        this.state = true;
    else if (override == false)
        this.state = false;
    else
        this.state = !this.state;

    if (this.setState) {
        if (this.setState(this.state) == false) {
            this.state = !this.state;
            return;
        }
    }

    if (this.checkbox) {
        if (this.state == false) {
            jQuery(this.checkbox).removeClass('settingsCheckboxChecked');
        } else {
            jQuery(this.checkbox).addClass('settingsCheckboxChecked');
        }
    }

    if (!init)
        loStore[this.key] = this.state;
}

Toggle.prototype.restore = function () {
    if (this.setState)
        this.setState(this.state);
}

Toggle.prototype.hideCheckbox = function () {
    if (this.checkbox)
        jQuery(this.checkbox).parent().hide();
}
