/* global CMS, createClass, h */
(function () {
  'use strict';

  const SiteContentPreview = createClass({
    displayName: 'PoolSiteContentPreview',

    render: function () {
      const { entry, widgetFor } = this.props;
      const title = entry.getIn(['data', 'title']) ?? '';
      const description = entry.getIn(['data', 'description']) ?? '';

      return h(
        'article',
        { className: 'page-shell' },
        h(
          'header',
          { className: 'page-header' },
          h('h1', null, title),
          description ? h('p', { className: 'lead' }, description) : null,
        ),
        h('div', { className: 'content' }, widgetFor('body')),
      );
    },
  });

  CMS.registerPreviewStyle('../assets/css/main.css?v=1');
  CMS.registerPreviewTemplate('pages', SiteContentPreview);
  CMS.registerPreviewTemplate('posts', SiteContentPreview);
})();
