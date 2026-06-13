<?php
/**
 * Core plugin class for EazInvoice WordPress.
 *
 * @package EazInvoice
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Loads the EazInvoice freemium WordPress integration.
 */
final class EazInvoice_Plugin {
	/**
	 * Singleton instance.
	 *
	 * @var EazInvoice_Plugin|null
	 */
	private static $instance = null;

	/**
	 * Option name used by the plugin.
	 *
	 * @var string
	 */
	private $option_name = 'eazinvoice_settings';

	/**
	 * Option name used for local free-tier document records.
	 *
	 * @var string
	 */
	private $records_option_name = 'eazinvoice_records';

	/**
	 * Return plugin instance.
	 *
	 * @return EazInvoice_Plugin
	 */
	public static function instance() {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}

		return self::$instance;
	}

	/**
	 * Register WordPress hooks.
	 */
	private function __construct() {
		add_action( 'admin_menu', array( $this, 'register_admin_menu' ) );
		add_action( 'admin_init', array( $this, 'register_settings' ) );
		add_action( 'admin_post_eazinvoice_save_document', array( $this, 'handle_save_document' ) );
		add_action( 'admin_enqueue_scripts', array( $this, 'enqueue_admin_assets' ) );
		add_action( 'wp_enqueue_scripts', array( $this, 'enqueue_public_assets' ) );
		add_action( 'wp_footer', array( $this, 'render_floating_invoice_button' ) );
		add_shortcode( 'eazinvoice_button', array( $this, 'render_invoice_button_shortcode' ) );
		add_shortcode( 'eazinvoice_free_invoice', array( $this, 'render_invoice_button_shortcode' ) );
	}

	/**
	 * Register plugin settings page.
	 */
	public function register_admin_menu() {
		add_menu_page(
			__( 'EazInvoice', 'eazinvoice' ),
			__( 'EazInvoice', 'eazinvoice' ),
			'manage_options',
			'eazinvoice',
			array( $this, 'render_dashboard_page' ),
			'dashicons-media-spreadsheet',
			56
		);

		add_submenu_page(
			'eazinvoice',
			__( 'EazInvoice Dashboard', 'eazinvoice' ),
			__( 'Dashboard', 'eazinvoice' ),
			'manage_options',
			'eazinvoice',
			array( $this, 'render_dashboard_page' )
		);

		add_submenu_page(
			'eazinvoice',
			__( 'Create Invoice', 'eazinvoice' ),
			__( 'Create Invoice', 'eazinvoice' ),
			'manage_options',
			'eazinvoice-create-invoice',
			array( $this, 'render_create_invoice_page' )
		);

		add_submenu_page(
			'eazinvoice',
			__( 'Create PO / WO', 'eazinvoice' ),
			__( 'Create PO / WO', 'eazinvoice' ),
			'manage_options',
			'eazinvoice-create-po',
			array( $this, 'render_create_po_page' )
		);

		add_submenu_page(
			'eazinvoice',
			__( 'Subscription', 'eazinvoice' ),
			__( 'Subscription', 'eazinvoice' ),
			'manage_options',
			'eazinvoice-subscription',
			array( $this, 'render_subscription_page' )
		);

		add_submenu_page(
			'eazinvoice',
			__( 'API Access', 'eazinvoice' ),
			__( 'API Access', 'eazinvoice' ),
			'manage_options',
			'eazinvoice-api-access',
			array( $this, 'render_api_access_page' )
		);

		add_submenu_page(
			'eazinvoice',
			__( 'Settings', 'eazinvoice' ),
			__( 'Settings', 'eazinvoice' ),
			'manage_options',
			'eazinvoice-settings',
			array( $this, 'render_settings_page' )
		);
	}

	/**
	 * Register plugin settings.
	 */
	public function register_settings() {
		register_setting(
			'eazinvoice_settings_group',
			$this->option_name,
			array(
				'type'              => 'array',
				'sanitize_callback' => array( $this, 'sanitize_settings' ),
				'default'           => $this->default_settings(),
			)
		);
	}

	/**
	 * Load admin CSS only on this plugin page.
	 *
	 * @param string $hook Current admin screen hook.
	 */
	public function enqueue_admin_assets( $hook ) {
		if ( false === strpos( $hook, 'eazinvoice' ) ) {
			return;
		}

		wp_enqueue_style(
			'eazinvoice-admin',
			EAZINVOICE_PLUGIN_URL . 'styles.css',
			array(),
			EAZINVOICE_VERSION
		);
	}

	/**
	 * Load public CSS for shortcode output.
	 */
	public function enqueue_public_assets() {
		wp_enqueue_style(
			'eazinvoice-public',
			EAZINVOICE_PLUGIN_URL . 'styles.css',
			array(),
			EAZINVOICE_VERSION
		);
	}

	/**
	 * Default settings.
	 *
	 * @return array
	 */
	private function default_settings() {
		return array(
			'account_email' => '',
			'api_key'       => '',
			'api_status'    => 'not_connected',
			'api_settings_url' => 'https://www.eazinvoice.com/apps/web/access.html',
			'workspace_url' => 'https://www.eazinvoice.com/apps/web/index.html',
			'upgrade_url'   => 'https://www.eazinvoice.com/apps/web/index.html',
			'button_label'  => __( 'Create invoice with EazInvoice', 'eazinvoice' ),
			'auto_button'   => '1',
			'button_position' => 'bottom-right',
			'plan'          => 'free',
		);
	}

	/**
	 * Read plugin settings.
	 *
	 * @return array
	 */
	private function get_settings() {
		return wp_parse_args( get_option( $this->option_name, array() ), $this->default_settings() );
	}

	/**
	 * Plugin tier definitions shown inside WordPress.
	 *
	 * @return array
	 */
	private function get_plan_catalog() {
		return array(
			array(
				'id'       => 'free',
				'label'    => __( 'Free', 'eazinvoice' ),
				'price'    => __( 'INR 0', 'eazinvoice' ),
				'status'   => __( 'Active in this plugin', 'eazinvoice' ),
				'features' => array(
					__( 'Automatic EazInvoice site button', 'eazinvoice' ),
					__( 'Embedded invoice creation', 'eazinvoice' ),
					__( 'Embedded PO / WO creation', 'eazinvoice' ),
					__( 'Draft and created document records', 'eazinvoice' ),
					__( 'Basic dashboard and subscription view', 'eazinvoice' ),
				),
			),
			array(
				'id'       => 'standard',
				'label'    => __( 'Standard', 'eazinvoice' ),
				'price'    => __( 'Paid tier', 'eazinvoice' ),
				'status'   => __( 'Buy from EazInvoice', 'eazinvoice' ),
				'features' => array(
					__( 'Lead form to invoice draft', 'eazinvoice' ),
					__( 'Customer and service mapping', 'eazinvoice' ),
					__( 'WhatsApp sharing and branding controls', 'eazinvoice' ),
					__( 'Optional WooCommerce integration', 'eazinvoice' ),
					__( 'One website license', 'eazinvoice' ),
				),
			),
			array(
				'id'       => 'pro',
				'label'    => __( 'Pro', 'eazinvoice' ),
				'price'    => __( 'Paid tier', 'eazinvoice' ),
				'status'   => __( 'Buy from EazInvoice', 'eazinvoice' ),
				'features' => array(
					__( 'Service inquiry to invoice automation', 'eazinvoice' ),
					__( 'PO / WO request workflow', 'eazinvoice' ),
					__( 'GST-ready reports', 'eazinvoice' ),
					__( 'Payment tracking and gateway status sync', 'eazinvoice' ),
					__( 'Up to three website licenses', 'eazinvoice' ),
				),
			),
			array(
				'id'       => 'business',
				'label'    => __( 'Business', 'eazinvoice' ),
				'price'    => __( 'Custom paid tier', 'eazinvoice' ),
				'status'   => __( 'Contact EazInvoice', 'eazinvoice' ),
				'features' => array(
					__( 'Multi-site plugin access', 'eazinvoice' ),
					__( 'Team and approval workflow', 'eazinvoice' ),
					__( 'API access for custom websites', 'eazinvoice' ),
					__( 'Advanced analytics and priority workflow', 'eazinvoice' ),
					__( 'Priority support', 'eazinvoice' ),
				),
			),
		);
	}

	/**
	 * Sanitize settings before saving.
	 *
	 * @param array $input Raw settings.
	 * @return array
	 */
	public function sanitize_settings( $input ) {
		$input = is_array( $input ) ? $input : array();

		return array(
			'account_email' => sanitize_email( $input['account_email'] ?? '' ),
			'api_key'       => sanitize_text_field( $input['api_key'] ?? '' ),
			'api_status'    => empty( $input['api_key'] ) ? 'not_connected' : 'key_saved_pending_validation',
			'api_settings_url' => esc_url_raw( $input['api_settings_url'] ?? 'https://www.eazinvoice.com/apps/web/access.html' ),
			'workspace_url' => esc_url_raw( $input['workspace_url'] ?? 'https://www.eazinvoice.com/apps/web/index.html' ),
			'upgrade_url'   => esc_url_raw( $input['upgrade_url'] ?? 'https://www.eazinvoice.com/apps/web/index.html' ),
			'button_label'  => sanitize_text_field( $input['button_label'] ?? __( 'Create invoice with EazInvoice', 'eazinvoice' ) ),
			'auto_button'   => empty( $input['auto_button'] ) ? '0' : '1',
			'button_position' => in_array( $input['button_position'] ?? 'bottom-right', array( 'bottom-right', 'bottom-left' ), true ) ? $input['button_position'] : 'bottom-right',
			'plan'          => in_array( $input['plan'] ?? 'free', array( 'free', 'standard', 'pro', 'business' ), true ) ? $input['plan'] : 'free',
		);
	}

	/**
	 * Link to the embedded WordPress invoice screen.
	 *
	 * @return string
	 */
	private function get_create_invoice_url() {
		return admin_url( 'admin.php?page=eazinvoice-create-invoice' );
	}

	/**
	 * Link to the embedded PO/WO screen.
	 *
	 * @return string
	 */
	private function get_create_po_url() {
		return admin_url( 'admin.php?page=eazinvoice-create-po' );
	}

	/**
	 * Read locally stored plugin documents.
	 *
	 * @return array
	 */
	private function get_records() {
		$records = get_option(
			$this->records_option_name,
			array(
				'invoices' => array(),
				'orders'   => array(),
			)
		);

		return wp_parse_args(
			is_array( $records ) ? $records : array(),
			array(
				'invoices' => array(),
				'orders'   => array(),
			)
		);
	}

	/**
	 * Persist locally stored plugin documents.
	 *
	 * @param array $records Records array.
	 */
	private function update_records( $records ) {
		update_option( $this->records_option_name, $records, false );
	}

	/**
	 * Generate local document numbers for the embedded free tier.
	 *
	 * @param string $type Document type.
	 * @param string $document_type PO or WO.
	 * @return string
	 */
	private function generate_document_number( $type, $document_type = 'po' ) {
		$records = $this->get_records();
		$year    = gmdate( 'Y' );

		if ( 'invoice' === $type ) {
			return 'WP/INV/' . $year . '/' . str_pad( (string) ( count( $records['invoices'] ) + 1 ), 4, '0', STR_PAD_LEFT );
		}

		$prefix = 'wo' === $document_type ? 'WO' : 'PO';
		return 'WP/' . $prefix . '/' . $year . '/' . str_pad( (string) ( count( $records['orders'] ) + 1 ), 4, '0', STR_PAD_LEFT );
	}

	/**
	 * Handle embedded free-tier document save.
	 */
	public function handle_save_document() {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'Permission denied.', 'eazinvoice' ) );
		}

		check_admin_referer( 'eazinvoice_save_document' );

		$post          = wp_unslash( $_POST );
		$type          = 'po' === sanitize_key( $post['document_family'] ?? 'invoice' ) ? 'po' : 'invoice';
		$status        = 'created' === sanitize_key( $post['document_status'] ?? 'draft' ) ? 'created' : 'draft';
		$document_type = 'wo' === sanitize_key( $post['document_type'] ?? 'po' ) ? 'wo' : 'po';
		$currency      = strtoupper( sanitize_text_field( $post['currency'] ?? 'INR' ) );
		$quantity      = max( 0, (float) sanitize_text_field( $post['quantity'] ?? 0 ) );
		$rate          = max( 0, (float) sanitize_text_field( $post['rate'] ?? 0 ) );
		$discount      = max( 0, (float) sanitize_text_field( $post['discount'] ?? 0 ) );
		$tax_rate      = max( 0, (float) sanitize_text_field( $post['tax_rate'] ?? 0 ) );
		$subtotal      = $quantity * $rate;
		$taxable       = max( 0, $subtotal - $discount );
		$tax_amount    = ( $taxable * $tax_rate ) / 100;
		$total         = $taxable + $tax_amount;

		$record = array(
			'id'             => uniqid( 'ei_', true ),
			'number'         => $this->generate_document_number( $type, $document_type ),
			'type'           => $type,
			'document_type'  => $document_type,
			'status'         => $status,
			'party_name'     => sanitize_text_field( $post['party_name'] ?? '' ),
			'party_email'    => sanitize_email( $post['party_email'] ?? '' ),
			'currency'       => in_array( $currency, array( 'INR', 'USD', 'AUD', 'EUR', 'GBP' ), true ) ? $currency : 'INR',
			'item_name'      => sanitize_text_field( $post['item_name'] ?? '' ),
			'item_code'      => sanitize_text_field( $post['item_code'] ?? '' ),
			'quantity'       => $quantity,
			'rate'           => $rate,
			'discount'       => $discount,
			'tax_rate'       => $tax_rate,
			'tax_amount'     => $tax_amount,
			'total'          => $total,
			'created_at'     => current_time( 'mysql' ),
		);

		$records = $this->get_records();
		if ( 'invoice' === $type ) {
			$records['invoices'][] = $record;
			$redirect = $this->get_create_invoice_url();
		} else {
			$records['orders'][] = $record;
			$redirect = $this->get_create_po_url();
		}

		$this->update_records( $records );

		wp_safe_redirect(
			add_query_arg(
				array(
					'eazinvoice_saved' => $status,
					'eazinvoice_no'    => rawurlencode( $record['number'] ),
				),
				$redirect
			)
		);
		exit;
	}

	/**
	 * Render internal plugin navigation.
	 *
	 * @param string $active Active page key.
	 */
	private function render_admin_nav( $active ) {
		$links = array(
			'dashboard'    => array( __( 'Dashboard', 'eazinvoice' ), admin_url( 'admin.php?page=eazinvoice' ) ),
			'invoice'      => array( __( 'Create Invoice', 'eazinvoice' ), $this->get_create_invoice_url() ),
			'po'           => array( __( 'Create PO / WO', 'eazinvoice' ), $this->get_create_po_url() ),
			'subscription' => array( __( 'Subscription', 'eazinvoice' ), admin_url( 'admin.php?page=eazinvoice-subscription' ) ),
			'api'          => array( __( 'API Access', 'eazinvoice' ), admin_url( 'admin.php?page=eazinvoice-api-access' ) ),
			'settings'     => array( __( 'Settings', 'eazinvoice' ), admin_url( 'admin.php?page=eazinvoice-settings' ) ),
		);

		echo '<nav class="eazinvoice-admin-nav" aria-label="' . esc_attr__( 'EazInvoice sections', 'eazinvoice' ) . '">';
		foreach ( $links as $key => $link ) {
			$class = $active === $key ? ' class="is-active"' : '';
			echo '<a' . $class . ' href="' . esc_url( $link[1] ) . '">' . esc_html( $link[0] ) . '</a>';
		}
		echo '</nav>';
	}

	/**
	 * Render dashboard page.
	 */
	public function render_dashboard_page() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}

		$settings       = $this->get_settings();
		$records        = $this->get_records();
		$invoices       = $records['invoices'];
		$orders         = $records['orders'];
		$created_income = array_reduce(
			array_filter( $invoices, fn( $record ) => 'created' === ( $record['status'] ?? '' ) ),
			fn( $sum, $record ) => $sum + (float) ( $record['total'] ?? 0 ),
			0
		);
		$created_expense = array_reduce(
			array_filter( $orders, fn( $record ) => 'created' === ( $record['status'] ?? '' ) ),
			fn( $sum, $record ) => $sum + (float) ( $record['total'] ?? 0 ),
			0
		);
		?>
		<div class="wrap eazinvoice-admin">
			<?php $this->render_admin_nav( 'dashboard' ); ?>
			<section class="eazinvoice-hero">
				<div>
					<img src="<?php echo esc_url( EAZINVOICE_PLUGIN_URL . 'assets/eazinvoice-logo-full.png' ); ?>" alt="<?php esc_attr_e( 'EazInvoice', 'eazinvoice' ); ?>" />
					<p><?php esc_html_e( 'Embedded EazInvoice workspace for this WordPress website. Free users can use the local invoice workspace; paid users will unlock deeper automation after license/API validation is added.', 'eazinvoice' ); ?></p>
				</div>
				<a class="eazinvoice-button eazinvoice-button-primary" href="<?php echo esc_url( $this->get_create_invoice_url() ); ?>">
					<?php esc_html_e( 'Create Invoice', 'eazinvoice' ); ?>
				</a>
			</section>

			<section class="eazinvoice-card">
				<div class="eazinvoice-section-head">
					<div>
						<h1><?php esc_html_e( 'Website Billing Workspace', 'eazinvoice' ); ?></h1>
						<p><?php esc_html_e( 'This area is designed to work inside the customer WordPress website. Upgrade/payment links can open EazInvoice, but day-to-day invoice actions should remain embedded here.', 'eazinvoice' ); ?></p>
					</div>
					<span class="eazinvoice-plan-pill"><?php echo esc_html( strtoupper( $settings['plan'] ) ); ?></span>
				</div>
				<div class="eazinvoice-workspace-grid">
					<a class="eazinvoice-workspace-tile" href="<?php echo esc_url( $this->get_create_invoice_url() ); ?>">
						<strong><?php esc_html_e( 'Create Invoice', 'eazinvoice' ); ?></strong>
						<span><?php esc_html_e( 'Open the embedded invoice form for service and B2B billing.', 'eazinvoice' ); ?></span>
					</a>
					<a class="eazinvoice-workspace-tile" href="<?php echo esc_url( $this->get_create_po_url() ); ?>">
						<strong><?php esc_html_e( 'Create PO / WO', 'eazinvoice' ); ?></strong>
						<span><?php esc_html_e( 'Create purchase orders and work orders for expense-side records.', 'eazinvoice' ); ?></span>
					</a>
					<a class="eazinvoice-workspace-tile" href="<?php echo esc_url( admin_url( 'admin.php?page=eazinvoice-subscription' ) ); ?>">
						<strong><?php esc_html_e( 'Subscription', 'eazinvoice' ); ?></strong>
						<span><?php esc_html_e( 'See current free tier and paid feature upgrade path.', 'eazinvoice' ); ?></span>
					</a>
					<a class="eazinvoice-workspace-tile" href="<?php echo esc_url( admin_url( 'admin.php?page=eazinvoice-settings' ) ); ?>">
						<strong><?php esc_html_e( 'Settings', 'eazinvoice' ); ?></strong>
						<span><?php esc_html_e( 'Control the automatic site button, account email, and license/API details.', 'eazinvoice' ); ?></span>
					</a>
					<a class="eazinvoice-workspace-tile" href="<?php echo esc_url( admin_url( 'admin.php?page=eazinvoice-api-access' ) ); ?>">
						<strong><?php esc_html_e( 'API Access', 'eazinvoice' ); ?></strong>
						<span><?php esc_html_e( 'Connect this WordPress site to the customer EazInvoice subscription.', 'eazinvoice' ); ?></span>
					</a>
				</div>
			</section>

			<section class="eazinvoice-card">
				<h1><?php esc_html_e( 'Free Tier Summary', 'eazinvoice' ); ?></h1>
				<div class="eazinvoice-metric-grid">
					<article><span><?php esc_html_e( 'Invoice Drafts', 'eazinvoice' ); ?></span><strong><?php echo esc_html( count( array_filter( $invoices, fn( $record ) => 'draft' === ( $record['status'] ?? '' ) ) ) ); ?></strong></article>
					<article><span><?php esc_html_e( 'Created Invoices', 'eazinvoice' ); ?></span><strong><?php echo esc_html( count( array_filter( $invoices, fn( $record ) => 'created' === ( $record['status'] ?? '' ) ) ) ); ?></strong></article>
					<article><span><?php esc_html_e( 'PO / WO Drafts', 'eazinvoice' ); ?></span><strong><?php echo esc_html( count( array_filter( $orders, fn( $record ) => 'draft' === ( $record['status'] ?? '' ) ) ) ); ?></strong></article>
					<article><span><?php esc_html_e( 'Created PO / WO', 'eazinvoice' ); ?></span><strong><?php echo esc_html( count( array_filter( $orders, fn( $record ) => 'created' === ( $record['status'] ?? '' ) ) ) ); ?></strong></article>
					<article><span><?php esc_html_e( 'Income', 'eazinvoice' ); ?></span><strong><?php echo esc_html( 'INR ' . number_format_i18n( $created_income, 2 ) ); ?></strong></article>
					<article><span><?php esc_html_e( 'Expenses', 'eazinvoice' ); ?></span><strong><?php echo esc_html( 'INR ' . number_format_i18n( $created_expense, 2 ) ); ?></strong></article>
				</div>
			</section>
		</div>
		<?php
	}

	/**
	 * Render a document saved notice.
	 */
	private function render_saved_notice() {
		if ( empty( $_GET['eazinvoice_saved'] ) ) {
			return;
		}

		$saved_status = sanitize_key( wp_unslash( $_GET['eazinvoice_saved'] ) );
		$status       = 'created' === $saved_status ? __( 'created', 'eazinvoice' ) : __( 'saved as draft', 'eazinvoice' );
		$number = sanitize_text_field( wp_unslash( $_GET['eazinvoice_no'] ?? '' ) );

		echo '<div class="notice notice-success is-dismissible"><p>' . esc_html( sprintf( __( '%1$s %2$s successfully.', 'eazinvoice' ), $number, $status ) ) . '</p></div>';
	}

	/**
	 * Render the embedded free-tier document form.
	 *
	 * @param string $family invoice or po.
	 */
	private function render_document_form( $family = 'invoice' ) {
		$is_po       = 'po' === $family;
		$records     = $this->get_records();
		$list        = $is_po ? $records['orders'] : $records['invoices'];
		$title       = $is_po ? __( 'Create Purchase Order / Work Order Inside WordPress', 'eazinvoice' ) : __( 'Create Invoice Inside WordPress', 'eazinvoice' );
		$description = $is_po
			? __( 'Create PO or WO records for vendors, service providers, procurement, and expense tracking.', 'eazinvoice' )
			: __( 'Create invoice records for service and B2B billing from inside WordPress.', 'eazinvoice' );
		?>
		<?php $this->render_saved_notice(); ?>
		<section class="eazinvoice-card">
			<span class="eazinvoice-plan-pill"><?php esc_html_e( 'Free embedded workspace', 'eazinvoice' ); ?></span>
			<h1><?php echo esc_html( $title ); ?></h1>
			<p><?php echo esc_html( $description ); ?></p>
			<form class="eazinvoice-mini-form" method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
				<?php wp_nonce_field( 'eazinvoice_save_document' ); ?>
				<input type="hidden" name="action" value="eazinvoice_save_document" />
				<input type="hidden" name="document_family" value="<?php echo esc_attr( $family ); ?>" />
				<?php if ( $is_po ) : ?>
					<label>
						<?php esc_html_e( 'Document Type', 'eazinvoice' ); ?>
						<select name="document_type">
							<option value="po"><?php esc_html_e( 'Purchase Order', 'eazinvoice' ); ?></option>
							<option value="wo"><?php esc_html_e( 'Work Order', 'eazinvoice' ); ?></option>
						</select>
					</label>
				<?php endif; ?>
				<label>
					<?php echo esc_html( $is_po ? __( 'Vendor / Supplier Name', 'eazinvoice' ) : __( 'Customer / Business Name', 'eazinvoice' ) ); ?>
					<input name="party_name" type="text" required placeholder="<?php echo esc_attr( $is_po ? __( 'ABC Suppliers', 'eazinvoice' ) : __( 'ABC Consultants', 'eazinvoice' ) ); ?>" />
				</label>
				<label>
					<?php echo esc_html( $is_po ? __( 'Vendor Email', 'eazinvoice' ) : __( 'Customer Email', 'eazinvoice' ) ); ?>
					<input name="party_email" type="email" placeholder="<?php esc_attr_e( 'billing@example.com', 'eazinvoice' ); ?>" />
				</label>
				<label>
					<?php esc_html_e( 'Currency', 'eazinvoice' ); ?>
					<select name="currency">
						<option value="INR"><?php esc_html_e( 'INR - Indian Rupee', 'eazinvoice' ); ?></option>
						<option value="USD"><?php esc_html_e( 'USD - US Dollar', 'eazinvoice' ); ?></option>
						<option value="AUD"><?php esc_html_e( 'AUD - Australian Dollar', 'eazinvoice' ); ?></option>
						<option value="EUR"><?php esc_html_e( 'EUR - Euro', 'eazinvoice' ); ?></option>
						<option value="GBP"><?php esc_html_e( 'GBP - Pound Sterling', 'eazinvoice' ); ?></option>
					</select>
				</label>
				<label>
					<?php esc_html_e( 'Goods / Service', 'eazinvoice' ); ?>
					<input name="item_name" type="text" required placeholder="<?php esc_attr_e( 'Website design service', 'eazinvoice' ); ?>" />
				</label>
				<label>
					<?php esc_html_e( 'HSN/SAC / Tax Code', 'eazinvoice' ); ?>
					<input name="item_code" type="text" placeholder="<?php esc_attr_e( '9983', 'eazinvoice' ); ?>" />
				</label>
				<label>
					<?php esc_html_e( 'Quantity', 'eazinvoice' ); ?>
					<input name="quantity" type="number" min="0" step="0.01" value="1" required />
				</label>
				<label>
					<?php esc_html_e( 'Rate', 'eazinvoice' ); ?>
					<input name="rate" type="number" min="0" step="0.01" value="0" required />
				</label>
				<label>
					<?php esc_html_e( 'Discount In Amount', 'eazinvoice' ); ?>
					<input name="discount" type="number" min="0" step="0.01" value="0" />
				</label>
				<label>
					<?php esc_html_e( 'GST / Tax %', 'eazinvoice' ); ?>
					<input name="tax_rate" type="number" min="0" step="0.01" value="18" />
				</label>
				<div class="eazinvoice-form-actions">
					<button class="eazinvoice-button eazinvoice-button-secondary" type="submit" name="document_status" value="draft"><?php esc_html_e( 'Save Draft', 'eazinvoice' ); ?></button>
					<button class="eazinvoice-button eazinvoice-button-primary" type="submit" name="document_status" value="created"><?php echo esc_html( $is_po ? __( 'Create PO / WO', 'eazinvoice' ) : __( 'Create Invoice', 'eazinvoice' ) ); ?></button>
				</div>
			</form>
		</section>

		<section class="eazinvoice-card">
			<h2><?php echo esc_html( $is_po ? __( 'PO / WO Records', 'eazinvoice' ) : __( 'Invoice Records', 'eazinvoice' ) ); ?></h2>
			<?php if ( empty( $list ) ) : ?>
				<div class="eazinvoice-notice-soft"><?php esc_html_e( 'No records yet. Save a draft or create a document to see it here.', 'eazinvoice' ); ?></div>
			<?php else : ?>
				<div class="eazinvoice-record-list">
					<?php foreach ( array_reverse( $list ) as $record ) : ?>
						<article>
							<div>
								<strong><?php echo esc_html( $record['number'] ?? '' ); ?></strong>
								<span><?php echo esc_html( ( $record['party_name'] ?? '' ) . ' - ' . ( $record['currency'] ?? 'INR' ) . ' ' . number_format_i18n( (float) ( $record['total'] ?? 0 ), 2 ) ); ?></span>
							</div>
							<mark class="eazinvoice-status-<?php echo esc_attr( $record['status'] ?? 'draft' ); ?>"><?php echo esc_html( strtoupper( $record['status'] ?? 'draft' ) ); ?></mark>
						</article>
					<?php endforeach; ?>
				</div>
			<?php endif; ?>
		</section>
		<?php
	}

	/**
	 * Render embedded invoice creation page.
	 */
	public function render_create_invoice_page() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}
		?>
		<div class="wrap eazinvoice-admin">
			<?php $this->render_admin_nav( 'invoice' ); ?>
			<?php $this->render_document_form( 'invoice' ); ?>
		</div>
		<?php
	}

	/**
	 * Render embedded PO/WO creation page.
	 */
	public function render_create_po_page() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}
		?>
		<div class="wrap eazinvoice-admin">
			<?php $this->render_admin_nav( 'po' ); ?>
			<?php $this->render_document_form( 'po' ); ?>
		</div>
		<?php
	}

	/**
	 * Render subscription page.
	 */
	public function render_subscription_page() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}

		$settings = $this->get_settings();
		$plans    = $this->get_plan_catalog();
		?>
		<div class="wrap eazinvoice-admin">
			<?php $this->render_admin_nav( 'subscription' ); ?>
			<section id="eazinvoice-plugin-tiers" class="eazinvoice-card">
				<div class="eazinvoice-section-head">
					<div>
						<h1><?php esc_html_e( 'Subscription And Plugin Features', 'eazinvoice' ); ?></h1>
						<p><?php esc_html_e( 'Free tier is available inside this WordPress website after plugin activation. Paid features should unlock here after upgrade and plugin/license refresh.', 'eazinvoice' ); ?></p>
					</div>
					<span class="eazinvoice-plan-pill"><?php echo esc_html( strtoupper( $settings['plan'] ) ); ?></span>
				</div>
				<div class="eazinvoice-plan-grid">
					<?php foreach ( $plans as $plan ) : ?>
						<article class="eazinvoice-plan-card eazinvoice-plan-<?php echo esc_attr( $plan['id'] ); ?>">
							<div class="eazinvoice-plan-head">
								<h2><?php echo esc_html( $plan['label'] ); ?></h2>
								<span><?php echo esc_html( $plan['price'] ); ?></span>
							</div>
							<strong><?php echo esc_html( $plan['status'] ); ?></strong>
							<ul>
								<?php foreach ( $plan['features'] as $feature ) : ?>
									<li><?php echo esc_html( $feature ); ?></li>
								<?php endforeach; ?>
							</ul>
							<?php if ( 'free' !== $plan['id'] ) : ?>
								<a class="eazinvoice-button eazinvoice-button-secondary" href="<?php echo esc_url( $settings['upgrade_url'] ); ?>#pricing" target="_blank" rel="noopener noreferrer">
									<?php esc_html_e( 'Upgrade On EazInvoice', 'eazinvoice' ); ?>
								</a>
							<?php endif; ?>
						</article>
					<?php endforeach; ?>
				</div>
			</section>
		</div>
		<?php
	}

	/**
	 * Render API connection page.
	 */
	public function render_api_access_page() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}

		$settings      = $this->get_settings();
		$is_connected = ! empty( $settings['api_key'] );
		$status_label = $is_connected ? __( 'API key saved - pending live validation', 'eazinvoice' ) : __( 'Not connected', 'eazinvoice' );
		?>
		<div class="wrap eazinvoice-admin">
			<?php $this->render_admin_nav( 'api' ); ?>
			<section class="eazinvoice-hero">
				<div>
					<img src="<?php echo esc_url( EAZINVOICE_PLUGIN_URL . 'assets/eazinvoice-logo-full.png' ); ?>" alt="<?php esc_attr_e( 'EazInvoice', 'eazinvoice' ); ?>" />
					<p><?php esc_html_e( 'Connect this WordPress website to the customer EazInvoice account. Generate the API key from the logged-in EazInvoice account, then paste it here.', 'eazinvoice' ); ?></p>
				</div>
				<a class="eazinvoice-button eazinvoice-button-primary" href="<?php echo esc_url( $settings['api_settings_url'] ); ?>" target="_blank" rel="noopener noreferrer">
					<?php esc_html_e( 'Open EazInvoice API Settings', 'eazinvoice' ); ?>
				</a>
			</section>

			<section class="eazinvoice-card">
				<div class="eazinvoice-section-head">
					<div>
						<h1><?php esc_html_e( 'Connect EazInvoice Account', 'eazinvoice' ); ?></h1>
						<p><?php esc_html_e( 'The customer should log in to EazInvoice, generate a WordPress API key, and paste it below. Paid tier features will unlock after API validation is added.', 'eazinvoice' ); ?></p>
					</div>
					<span class="eazinvoice-plan-pill"><?php echo esc_html( $status_label ); ?></span>
				</div>
				<form method="post" action="options.php">
					<?php settings_fields( 'eazinvoice_settings_group' ); ?>
					<table class="form-table" role="presentation">
						<tr>
							<th scope="row"><label for="eazinvoice_account_email_api"><?php esc_html_e( 'EazInvoice Account Email', 'eazinvoice' ); ?></label></th>
							<td><input id="eazinvoice_account_email_api" class="regular-text" type="email" name="eazinvoice_settings[account_email]" value="<?php echo esc_attr( $settings['account_email'] ); ?>" /></td>
						</tr>
						<tr>
							<th scope="row"><label for="eazinvoice_api_key_api"><?php esc_html_e( 'WordPress API Key', 'eazinvoice' ); ?></label></th>
							<td><input id="eazinvoice_api_key_api" class="regular-text" type="password" name="eazinvoice_settings[api_key]" value="<?php echo esc_attr( $settings['api_key'] ); ?>" autocomplete="off" /></td>
						</tr>
						<tr>
							<th scope="row"><label for="eazinvoice_api_settings_url"><?php esc_html_e( 'EazInvoice API Settings URL', 'eazinvoice' ); ?></label></th>
							<td><input id="eazinvoice_api_settings_url" class="regular-text" type="url" name="eazinvoice_settings[api_settings_url]" value="<?php echo esc_url( $settings['api_settings_url'] ); ?>" /></td>
						</tr>
					</table>
					<?php
					printf(
						'<input type="hidden" name="eazinvoice_settings[workspace_url]" value="%s" />',
						esc_attr( $settings['workspace_url'] )
					);
					printf(
						'<input type="hidden" name="eazinvoice_settings[upgrade_url]" value="%s" />',
						esc_attr( $settings['upgrade_url'] )
					);
					printf(
						'<input type="hidden" name="eazinvoice_settings[button_label]" value="%s" />',
						esc_attr( $settings['button_label'] )
					);
					printf(
						'<input type="hidden" name="eazinvoice_settings[button_position]" value="%s" />',
						esc_attr( $settings['button_position'] )
					);
					printf(
						'<input type="hidden" name="eazinvoice_settings[plan]" value="%s" />',
						esc_attr( $settings['plan'] )
					);
					if ( '1' === $settings['auto_button'] ) {
						echo '<input type="hidden" name="eazinvoice_settings[auto_button]" value="1" />';
					}
					submit_button( __( 'Save API Connection', 'eazinvoice' ) );
					?>
				</form>
				<div class="eazinvoice-steps">
					<article><span>1</span><strong><?php esc_html_e( 'Open EazInvoice', 'eazinvoice' ); ?></strong><p><?php esc_html_e( 'Log in to the customer account that owns the subscription.', 'eazinvoice' ); ?></p></article>
					<article><span>2</span><strong><?php esc_html_e( 'Generate API Key', 'eazinvoice' ); ?></strong><p><?php esc_html_e( 'Use Account Settings > API / WordPress Integration.', 'eazinvoice' ); ?></p></article>
					<article><span>3</span><strong><?php esc_html_e( 'Paste Key Here', 'eazinvoice' ); ?></strong><p><?php esc_html_e( 'Save it in the plugin. Live validation will be added when the API endpoint is ready.', 'eazinvoice' ); ?></p></article>
					<article><span>4</span><strong><?php esc_html_e( 'Unlock Features', 'eazinvoice' ); ?></strong><p><?php esc_html_e( 'The plugin will unlock features based on the subscription returned by EazInvoice.', 'eazinvoice' ); ?></p></article>
				</div>
			</section>
		</div>
		<?php
	}

	/**
	 * Render settings page.
	 */
	public function render_settings_page() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}

		$settings = $this->get_settings();
		?>
		<div class="wrap eazinvoice-admin">
			<?php $this->render_admin_nav( 'settings' ); ?>
			<div class="eazinvoice-hero">
				<div>
					<img src="<?php echo esc_url( EAZINVOICE_PLUGIN_URL . 'assets/eazinvoice-logo-full.png' ); ?>" alt="<?php esc_attr_e( 'EazInvoice', 'eazinvoice' ); ?>" />
					<p><?php esc_html_e( 'Control how EazInvoice appears inside this WordPress website.', 'eazinvoice' ); ?></p>
				</div>
				<a class="eazinvoice-button eazinvoice-button-primary" href="<?php echo esc_url( $this->get_create_invoice_url() ); ?>">
					<?php esc_html_e( 'Open Create Invoice', 'eazinvoice' ); ?>
				</a>
			</div>

			<section class="eazinvoice-card">
				<h1><?php esc_html_e( 'Free Plugin Setup', 'eazinvoice' ); ?></h1>
				<p><?php esc_html_e( 'Use these settings for the active free plugin button. The button opens the embedded WordPress invoice page. Upgrade links can open the EazInvoice pricing page.', 'eazinvoice' ); ?></p>
				<form method="post" action="options.php">
					<?php settings_fields( 'eazinvoice_settings_group' ); ?>
					<table class="form-table" role="presentation">
						<tr>
							<th scope="row"><label for="eazinvoice_account_email"><?php esc_html_e( 'Account Email', 'eazinvoice' ); ?></label></th>
							<td><input id="eazinvoice_account_email" class="regular-text" type="email" name="eazinvoice_settings[account_email]" value="<?php echo esc_attr( $settings['account_email'] ); ?>" /></td>
						</tr>
						<tr>
							<th scope="row"><label for="eazinvoice_api_key"><?php esc_html_e( 'API Key', 'eazinvoice' ); ?></label></th>
							<td>
								<input id="eazinvoice_api_key" class="regular-text" type="password" name="eazinvoice_settings[api_key]" value="<?php echo esc_attr( $settings['api_key'] ); ?>" autocomplete="off" />
								<p><a href="<?php echo esc_url( admin_url( 'admin.php?page=eazinvoice-api-access' ) ); ?>"><?php esc_html_e( 'Use API Access page for connection steps', 'eazinvoice' ); ?></a></p>
							</td>
						</tr>
						<tr>
							<th scope="row"><label for="eazinvoice_workspace_url"><?php esc_html_e( 'Legacy Workspace URL', 'eazinvoice' ); ?></label></th>
							<td><input id="eazinvoice_workspace_url" class="regular-text" type="url" name="eazinvoice_settings[workspace_url]" value="<?php echo esc_url( $settings['workspace_url'] ); ?>" /></td>
						</tr>
						<tr>
							<th scope="row"><label for="eazinvoice_upgrade_url"><?php esc_html_e( 'Upgrade / Pricing URL', 'eazinvoice' ); ?></label></th>
							<td><input id="eazinvoice_upgrade_url" class="regular-text" type="url" name="eazinvoice_settings[upgrade_url]" value="<?php echo esc_url( $settings['upgrade_url'] ); ?>" /></td>
						</tr>
						<tr>
							<th scope="row"><label for="eazinvoice_api_settings_url_settings"><?php esc_html_e( 'API Settings URL', 'eazinvoice' ); ?></label></th>
							<td><input id="eazinvoice_api_settings_url_settings" class="regular-text" type="url" name="eazinvoice_settings[api_settings_url]" value="<?php echo esc_url( $settings['api_settings_url'] ); ?>" /></td>
						</tr>
						<tr>
							<th scope="row"><label for="eazinvoice_button_label"><?php esc_html_e( 'Button Label', 'eazinvoice' ); ?></label></th>
							<td><input id="eazinvoice_button_label" class="regular-text" type="text" name="eazinvoice_settings[button_label]" value="<?php echo esc_attr( $settings['button_label'] ); ?>" /></td>
						</tr>
						<tr>
							<th scope="row"><?php esc_html_e( 'Automatic Site Button', 'eazinvoice' ); ?></th>
							<td>
								<label>
									<input type="checkbox" name="eazinvoice_settings[auto_button]" value="1" <?php checked( '1', $settings['auto_button'] ); ?> />
									<?php esc_html_e( 'Show EazInvoice button automatically on the public website', 'eazinvoice' ); ?>
								</label>
							</td>
						</tr>
						<tr>
							<th scope="row"><label for="eazinvoice_button_position"><?php esc_html_e( 'Button Position', 'eazinvoice' ); ?></label></th>
							<td>
								<select id="eazinvoice_button_position" name="eazinvoice_settings[button_position]">
									<option value="bottom-right" <?php selected( 'bottom-right', $settings['button_position'] ); ?>><?php esc_html_e( 'Bottom right', 'eazinvoice' ); ?></option>
									<option value="bottom-left" <?php selected( 'bottom-left', $settings['button_position'] ); ?>><?php esc_html_e( 'Bottom left', 'eazinvoice' ); ?></option>
								</select>
							</td>
						</tr>
					</table>
					<?php submit_button( __( 'Save Free Plugin Settings', 'eazinvoice' ) ); ?>
				</form>
			</section>

			<section class="eazinvoice-card">
				<h2><?php esc_html_e( 'Shortcode', 'eazinvoice' ); ?></h2>
				<p><code>[eazinvoice_button]</code></p>
				<p><?php esc_html_e( 'Optional: place this shortcode on any WordPress page when you want a button inside page content in addition to the automatic site button.', 'eazinvoice' ); ?></p>
			</section>
		</div>
		<?php
	}

	/**
	 * Render public shortcode button.
	 *
	 * @param array $atts Shortcode attributes.
	 * @return string
	 */
	public function render_invoice_button_shortcode( $atts ) {
		$settings = $this->get_settings();
		$atts     = shortcode_atts(
			array(
				'label' => $settings['button_label'],
				'url'   => $this->get_create_invoice_url(),
			),
			$atts,
			'eazinvoice_button'
		);

		$url   = esc_url( $atts['url'] );
		$label = esc_html( $atts['label'] );

		return '<div class="eazinvoice-shortcode"><a class="eazinvoice-shortcode-button" href="' . $url . '" target="_blank" rel="noopener noreferrer">' . $label . '</a></div>';
	}

	/**
	 * Render the automatic public website button.
	 */
	public function render_floating_invoice_button() {
		$settings = $this->get_settings();

		if ( '1' !== $settings['auto_button'] || is_admin() ) {
			return;
		}

		$url      = esc_url( $this->get_create_invoice_url() );
		$label    = esc_html( $settings['button_label'] );
		$position = 'bottom-left' === $settings['button_position'] ? 'bottom-left' : 'bottom-right';

		echo '<div class="eazinvoice-floating-cta eazinvoice-floating-cta-' . esc_attr( $position ) . '"><a href="' . $url . '" target="_blank" rel="noopener noreferrer">' . $label . '</a></div>';
	}
}
