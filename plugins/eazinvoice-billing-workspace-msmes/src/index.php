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
		add_action( 'admin_init', array( $this, 'register_privacy_policy_content' ) );
		add_action( 'admin_post_eazinvoice_save_document', array( $this, 'handle_save_document' ) );
		add_action( 'admin_post_eazinvoice_print_document', array( $this, 'handle_print_document' ) );
		add_action( 'admin_post_eazinvoice_email_document', array( $this, 'handle_email_document' ) );
		add_action( 'admin_post_eazinvoice_validate_connection', array( $this, 'handle_validate_connection' ) );
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
			__( 'EazInvoice', 'eazinvoice-billing-workspace-msmes' ),
			__( 'EazInvoice', 'eazinvoice-billing-workspace-msmes' ),
			'manage_options',
			'eazinvoice',
			array( $this, 'render_dashboard_page' ),
			'dashicons-media-spreadsheet',
			56
		);

		add_submenu_page(
			'eazinvoice',
			__( 'EazInvoice Dashboard', 'eazinvoice-billing-workspace-msmes' ),
			__( 'Dashboard', 'eazinvoice-billing-workspace-msmes' ),
			'manage_options',
			'eazinvoice',
			array( $this, 'render_dashboard_page' )
		);

		add_submenu_page(
			'eazinvoice',
			__( 'Create Invoice', 'eazinvoice-billing-workspace-msmes' ),
			__( 'Create Invoice', 'eazinvoice-billing-workspace-msmes' ),
			'manage_options',
			'eazinvoice-create-invoice',
			array( $this, 'render_create_invoice_page' )
		);

		add_submenu_page(
			'eazinvoice',
			__( 'Create PO / WO', 'eazinvoice-billing-workspace-msmes' ),
			__( 'Create PO / WO', 'eazinvoice-billing-workspace-msmes' ),
			'manage_options',
			'eazinvoice-create-po',
			array( $this, 'render_create_po_page' )
		);

		add_submenu_page(
			'eazinvoice',
			__( 'Subscription', 'eazinvoice-billing-workspace-msmes' ),
			__( 'Subscription', 'eazinvoice-billing-workspace-msmes' ),
			'manage_options',
			'eazinvoice-subscription',
			array( $this, 'render_subscription_page' )
		);

		add_submenu_page(
			'eazinvoice',
			__( 'API Access', 'eazinvoice-billing-workspace-msmes' ),
			__( 'API Access', 'eazinvoice-billing-workspace-msmes' ),
			'manage_options',
			'eazinvoice-api-access',
			array( $this, 'render_api_access_page' )
		);

		add_submenu_page(
			'eazinvoice',
			__( 'Payment Gateway', 'eazinvoice-billing-workspace-msmes' ),
			__( 'Payment Gateway', 'eazinvoice-billing-workspace-msmes' ),
			'manage_options',
			'eazinvoice-payment-gateway',
			array( $this, 'render_payment_gateway_page' )
		);

		add_submenu_page(
			'eazinvoice',
			__( 'Find a Feature', 'eazinvoice-billing-workspace-msmes' ),
			__( 'Find a Feature', 'eazinvoice-billing-workspace-msmes' ),
			'manage_options',
			'eazinvoice-search',
			array( $this, 'render_search_page' )
		);

		add_submenu_page(
			'eazinvoice',
			__( 'Settings', 'eazinvoice-billing-workspace-msmes' ),
			__( 'Settings', 'eazinvoice-billing-workspace-msmes' ),
			'manage_options',
			'eazinvoice-settings',
			array( $this, 'render_settings_page' )
		);

		add_submenu_page(
			'eazinvoice',
			__( 'SOP / Help', 'eazinvoice-billing-workspace-msmes' ),
			__( 'SOP / Help', 'eazinvoice-billing-workspace-msmes' ),
			'manage_options',
			'eazinvoice-help',
			array( $this, 'render_help_page' )
		);

		add_submenu_page(
			'eazinvoice',
			__( 'Privacy and Data Use', 'eazinvoice-billing-workspace-msmes' ),
			__( 'Privacy', 'eazinvoice-billing-workspace-msmes' ),
			'manage_options',
			'eazinvoice-privacy',
			array( $this, 'render_privacy_page' )
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
	 * Add EazInvoice guidance to the WordPress Privacy Policy helper.
	 */
	public function register_privacy_policy_content() {
		if ( ! function_exists( 'wp_add_privacy_policy_content' ) ) {
			return;
		}

		$content  = '<p>' . esc_html__( 'EazInvoice stores plugin settings and locally created invoice and purchase/work-order records in this WordPress website database. These records can include customer or vendor names, contact details, addresses, tax identifiers, document items, totals, and payment status.', 'eazinvoice-billing-workspace-msmes' ) . '</p>';
		$content .= '<p>' . esc_html__( 'When an administrator validates an EazInvoice API connection, the plugin sends the configured account email and API key to the configured EazInvoice service. The public invoice button is optional and appears only after the site administrator enables it. Razorpay secret keys are not stored by this plugin.', 'eazinvoice-billing-workspace-msmes' ) . '</p>';
		$content .= '<p>' . esc_html__( 'Site owners should describe their own lawful basis, retention period, customer notices, and connected EazInvoice services in their website privacy policy.', 'eazinvoice-billing-workspace-msmes' ) . '</p>';

		wp_add_privacy_policy_content(
			__( 'EazInvoice Billing Workspace', 'eazinvoice-billing-workspace-msmes' ),
			wp_kses_post( wpautop( $content, false ) )
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
			'api_message'   => '',
			'api_base_url'  => 'https://www.eazinvoice.com',
			'api_last_checked' => '',
			'api_settings_url' => 'https://www.eazinvoice.com/apps/web/access.html',
			'workspace_url' => 'https://www.eazinvoice.com/apps/web/index.html',
			'upgrade_url'   => 'https://www.eazinvoice.com/apps/web/index.html',
			'button_label'  => __( 'Create invoice with EazInvoice', 'eazinvoice-billing-workspace-msmes' ),
			'auto_button'   => '0',
			'button_position' => 'bottom-right',
			'plan'          => 'free',
			'gateway_status' => 'not_connected',
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
				'label'    => __( 'Free', 'eazinvoice-billing-workspace-msmes' ),
				'price'    => __( 'INR 0', 'eazinvoice-billing-workspace-msmes' ),
				'status'   => __( 'Active in this plugin', 'eazinvoice-billing-workspace-msmes' ),
				'features' => array(
					__( 'Optional EazInvoice site button', 'eazinvoice-billing-workspace-msmes' ),
					__( 'Embedded invoice creation', 'eazinvoice-billing-workspace-msmes' ),
					__( 'Embedded PO / WO creation', 'eazinvoice-billing-workspace-msmes' ),
					__( 'Draft and created document records', 'eazinvoice-billing-workspace-msmes' ),
					__( 'Basic dashboard and subscription view', 'eazinvoice-billing-workspace-msmes' ),
				),
			),
			array(
				'id'       => 'standard',
				'label'    => __( 'Standard', 'eazinvoice-billing-workspace-msmes' ),
				'price'    => __( 'INR 199/month, billed yearly as INR 2,388', 'eazinvoice-billing-workspace-msmes' ),
				'status'   => __( 'Buy from EazInvoice', 'eazinvoice-billing-workspace-msmes' ),
				'features' => array(
					__( 'WhatsApp sharing and branding controls', 'eazinvoice-billing-workspace-msmes' ),
					__( 'Razorpay collection link readiness', 'eazinvoice-billing-workspace-msmes' ),
					__( 'Recurring invoice draft workflow', 'eazinvoice-billing-workspace-msmes' ),
					__( 'Paid WordPress plugin access', 'eazinvoice-billing-workspace-msmes' ),
					__( 'One website license', 'eazinvoice-billing-workspace-msmes' ),
				),
			),
			array(
				'id'       => 'pro',
				'label'    => __( 'Pro', 'eazinvoice-billing-workspace-msmes' ),
				'price'    => __( 'INR 499/month, billed yearly as INR 5,988', 'eazinvoice-billing-workspace-msmes' ),
				'status'   => __( 'Buy from EazInvoice', 'eazinvoice-billing-workspace-msmes' ),
				'features' => array(
					__( 'AI invoice assistant', 'eazinvoice-billing-workspace-msmes' ),
					__( 'AI PO / WO assistant', 'eazinvoice-billing-workspace-msmes' ),
					__( 'Advanced GST-ready reports', 'eazinvoice-billing-workspace-msmes' ),
					__( 'Payment tracking and gateway status sync', 'eazinvoice-billing-workspace-msmes' ),
					__( 'Up to three website licenses', 'eazinvoice-billing-workspace-msmes' ),
				),
			),
			array(
				'id'       => 'business',
				'label'    => __( 'Business', 'eazinvoice-billing-workspace-msmes' ),
				'price'    => __( 'INR 999/month, billed yearly as INR 11,988', 'eazinvoice-billing-workspace-msmes' ),
				'status'   => __( 'Contact EazInvoice', 'eazinvoice-billing-workspace-msmes' ),
				'features' => array(
					__( 'Multi-site plugin access', 'eazinvoice-billing-workspace-msmes' ),
					__( 'Team and approval workflow', 'eazinvoice-billing-workspace-msmes' ),
					__( 'API access for custom websites', 'eazinvoice-billing-workspace-msmes' ),
					__( 'Advanced analytics and priority workflow', 'eazinvoice-billing-workspace-msmes' ),
					__( 'Priority support', 'eazinvoice-billing-workspace-msmes' ),
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
		$current = $this->get_settings();
		$api_key = sanitize_text_field( $input['api_key'] ?? '' );
		if ( '' === $api_key && ! empty( $current['api_key'] ) ) {
			$api_key = $current['api_key'];
		}

		return array(
			'account_email' => sanitize_email( $input['account_email'] ?? '' ),
			'api_key'       => $api_key,
			'api_status'    => empty( $api_key ) ? 'not_connected' : sanitize_key( $input['api_status'] ?? 'key_saved_pending_validation' ),
			'api_message'   => sanitize_text_field( $input['api_message'] ?? '' ),
			'api_base_url'  => esc_url_raw( $input['api_base_url'] ?? 'https://www.eazinvoice.com' ),
			'api_last_checked' => sanitize_text_field( $input['api_last_checked'] ?? '' ),
			'api_settings_url' => esc_url_raw( $input['api_settings_url'] ?? 'https://www.eazinvoice.com/apps/web/access.html' ),
			'workspace_url' => esc_url_raw( $input['workspace_url'] ?? 'https://www.eazinvoice.com/apps/web/index.html' ),
			'upgrade_url'   => esc_url_raw( $input['upgrade_url'] ?? 'https://www.eazinvoice.com/apps/web/index.html' ),
			'button_label'  => sanitize_text_field( $input['button_label'] ?? __( 'Create invoice with EazInvoice', 'eazinvoice-billing-workspace-msmes' ) ),
			'auto_button'   => empty( $input['auto_button'] ) ? '0' : '1',
			'button_position' => in_array( $input['button_position'] ?? 'bottom-right', array( 'bottom-right', 'bottom-left' ), true ) ? $input['button_position'] : 'bottom-right',
			'plan'          => in_array( $input['plan'] ?? 'free', array( 'free', 'standard', 'pro', 'business' ), true ) ? $input['plan'] : 'free',
			'gateway_status' => in_array( $input['gateway_status'] ?? 'not_connected', array( 'not_connected', 'available', 'live_ready' ), true ) ? $input['gateway_status'] : 'not_connected',
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
	 * Determine whether the connected plan includes a feature tier.
	 *
	 * @param string $required Minimum plan.
	 * @return bool
	 */
	private function plan_at_least( $required ) {
		$rank     = array( 'free' => 0, 'standard' => 1, 'pro' => 2, 'business' => 3 );
		$settings = $this->get_settings();
		$current  = sanitize_key( $settings['plan'] ?? 'free' );

		return ( $rank[ $current ] ?? 0 ) >= ( $rank[ $required ] ?? PHP_INT_MAX );
	}

	/**
	 * Find a locally stored plugin document without changing stored data.
	 *
	 * @param string $family invoice or po.
	 * @param string $record_id Record identifier.
	 * @return array|null
	 */
	private function find_document_record( $family, $record_id ) {
		$records = $this->get_records();
		$list    = 'po' === $family ? $records['orders'] : $records['invoices'];
		foreach ( $list as $record ) {
			if ( hash_equals( (string) ( $record['id'] ?? '' ), (string) $record_id ) ) {
				return $record;
			}
		}

		return null;
	}

	/**
	 * Return to the relevant embedded document workspace.
	 *
	 * @param string $family invoice or po.
	 * @return string
	 */
	private function get_document_return_url( $family ) {
		return 'po' === $family ? $this->get_create_po_url() : $this->get_create_invoice_url();
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
			wp_die( esc_html__( 'Permission denied.', 'eazinvoice-billing-workspace-msmes' ) );
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
	 * Render a protected browser document that can be printed or saved as PDF.
	 */
	public function handle_print_document() {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'Permission denied.', 'eazinvoice-billing-workspace-msmes' ) );
		}

		$family    = isset( $_GET['family'] ) && 'po' === sanitize_key( wp_unslash( $_GET['family'] ) ) ? 'po' : 'invoice';
		$record_id = sanitize_text_field( wp_unslash( $_GET['record_id'] ?? '' ) );
		check_admin_referer( 'eazinvoice_print_document_' . $record_id );
		$record = $this->find_document_record( $family, $record_id );
		if ( ! $record ) {
			wp_die( esc_html__( 'Document not found.', 'eazinvoice-billing-workspace-msmes' ), '', array( 'response' => 404 ) );
		}

		$document_type = 'invoice' === $family
			? __( 'Tax Invoice', 'eazinvoice-billing-workspace-msmes' )
			: ( 'wo' === ( $record['document_type'] ?? '' ) ? __( 'Work Order', 'eazinvoice-billing-workspace-msmes' ) : __( 'Purchase Order', 'eazinvoice-billing-workspace-msmes' ) );
		$currency      = sanitize_text_field( $record['currency'] ?? 'INR' );
		$subtotal      = max( 0, (float) ( $record['quantity'] ?? 0 ) * (float) ( $record['rate'] ?? 0 ) );
		$discount      = max( 0, (float) ( $record['discount'] ?? 0 ) );
		$total         = max( 0, (float) ( $record['total'] ?? 0 ) );

		nocache_headers();
		header( 'Content-Type: text/html; charset=' . get_option( 'blog_charset', 'UTF-8' ) );
		?><!doctype html>
		<html <?php language_attributes(); ?>>
		<head>
			<meta charset="<?php bloginfo( 'charset' ); ?>" />
			<meta name="viewport" content="width=device-width, initial-scale=1" />
			<title><?php echo esc_html( $document_type . ' ' . ( $record['number'] ?? '' ) ); ?></title>
			<style>
				body{margin:0;background:#eef3f8;color:#10213f;font:15px/1.5 Arial,sans-serif}.toolbar{display:flex;justify-content:flex-end;gap:10px;padding:16px;max-width:900px;margin:auto}.toolbar button{border:0;border-radius:6px;padding:11px 18px;background:#123d83;color:#fff;font-weight:700;cursor:pointer}.document{box-sizing:border-box;width:min(900px,calc(100% - 32px));margin:0 auto 32px;background:#fff;padding:44px;border-top:8px solid #123d83;box-shadow:0 14px 45px rgba(16,33,63,.14)}header{display:flex;justify-content:space-between;gap:24px;border-bottom:1px solid #d6deea;padding-bottom:20px}h1{margin:0;font-size:28px}h2{font-size:18px;margin:28px 0 10px}.meta{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:24px 0}.meta div,.totals div{padding:12px;background:#f5f8fc;border:1px solid #e0e7f0}.meta span,.totals span{display:block;color:#667085;font-size:12px;text-transform:uppercase}table{width:100%;border-collapse:collapse}th,td{padding:12px 8px;border-bottom:1px solid #d6deea;text-align:left}th:last-child,td:last-child{text-align:right}.totals{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:24px 0}.signature{margin-top:64px;text-align:right}.signature span{display:inline-block;min-width:220px;border-top:1px solid #10213f;padding-top:8px;text-align:center}@media(max-width:640px){.document{padding:22px}.meta,.totals{grid-template-columns:1fr}header{display:block}table{font-size:12px}}@media print{body{background:#fff}.toolbar{display:none}.document{width:100%;margin:0;box-shadow:none;padding:12mm}}
			</style>
		</head>
		<body>
			<div class="toolbar"><button type="button" onclick="window.print()"><?php esc_html_e( 'Print / Save as PDF', 'eazinvoice-billing-workspace-msmes' ); ?></button></div>
			<main class="document">
				<header><div><h1><?php echo esc_html( get_bloginfo( 'name' ) ); ?></h1><p><?php esc_html_e( 'Generated with EazInvoice', 'eazinvoice-billing-workspace-msmes' ); ?></p></div><div><strong><?php echo esc_html( $document_type ); ?></strong><br><?php echo esc_html( $record['number'] ?? '' ); ?></div></header>
				<section class="meta"><div><span><?php esc_html_e( 'Bill To / Vendor', 'eazinvoice-billing-workspace-msmes' ); ?></span><strong><?php echo esc_html( $record['party_name'] ?? '' ); ?></strong><br><?php echo esc_html( $record['party_email'] ?? '' ); ?></div><div><span><?php esc_html_e( 'Date', 'eazinvoice-billing-workspace-msmes' ); ?></span><?php echo esc_html( mysql2date( get_option( 'date_format' ), $record['created_at'] ?? current_time( 'mysql' ) ) ); ?></div><div><span><?php esc_html_e( 'Status', 'eazinvoice-billing-workspace-msmes' ); ?></span><?php echo esc_html( strtoupper( $record['status'] ?? 'draft' ) ); ?></div></section>
				<h2><?php esc_html_e( 'Items', 'eazinvoice-billing-workspace-msmes' ); ?></h2>
				<table><thead><tr><th><?php esc_html_e( 'Description', 'eazinvoice-billing-workspace-msmes' ); ?></th><th><?php esc_html_e( 'HSN/SAC', 'eazinvoice-billing-workspace-msmes' ); ?></th><th><?php esc_html_e( 'Qty', 'eazinvoice-billing-workspace-msmes' ); ?></th><th><?php esc_html_e( 'Rate', 'eazinvoice-billing-workspace-msmes' ); ?></th><th><?php esc_html_e( 'Total', 'eazinvoice-billing-workspace-msmes' ); ?></th></tr></thead><tbody><tr><td><?php echo esc_html( $record['item_name'] ?? '' ); ?></td><td><?php echo esc_html( $record['item_code'] ?? '' ); ?></td><td><?php echo esc_html( number_format_i18n( (float) ( $record['quantity'] ?? 0 ), 2 ) ); ?></td><td><?php echo esc_html( $currency . ' ' . number_format_i18n( (float) ( $record['rate'] ?? 0 ), 2 ) ); ?></td><td><?php echo esc_html( $currency . ' ' . number_format_i18n( $subtotal, 2 ) ); ?></td></tr></tbody></table>
				<section class="totals"><div><span><?php esc_html_e( 'Discount', 'eazinvoice-billing-workspace-msmes' ); ?></span><strong><?php echo esc_html( $currency . ' ' . number_format_i18n( $discount, 2 ) ); ?></strong></div><div><span><?php esc_html_e( 'Tax', 'eazinvoice-billing-workspace-msmes' ); ?></span><strong><?php echo esc_html( $currency . ' ' . number_format_i18n( (float) ( $record['tax_amount'] ?? 0 ), 2 ) ); ?></strong></div><div><span><?php esc_html_e( 'Total', 'eazinvoice-billing-workspace-msmes' ); ?></span><strong><?php echo esc_html( $currency . ' ' . number_format_i18n( $total, 2 ) ); ?></strong></div></section>
				<div class="signature"><span><?php esc_html_e( 'Authorised Signatory', 'eazinvoice-billing-workspace-msmes' ); ?></span></div>
			</main>
		</body></html><?php
		exit;
	}

	/**
	 * Email a protected document summary using the WordPress mail service.
	 */
	public function handle_email_document() {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'Permission denied.', 'eazinvoice-billing-workspace-msmes' ) );
		}

		$post      = wp_unslash( $_POST );
		$family    = 'po' === sanitize_key( $post['family'] ?? 'invoice' ) ? 'po' : 'invoice';
		$record_id = sanitize_text_field( $post['record_id'] ?? '' );
		check_admin_referer( 'eazinvoice_email_document_' . $record_id );
		$redirect = $this->get_document_return_url( $family );
		$record   = $this->find_document_record( $family, $record_id );
		$notice   = 'email_failed';

		if ( ! $this->plan_at_least( 'standard' ) ) {
			$notice = 'email_upgrade';
		} elseif ( ! $record ) {
			$notice = 'email_not_found';
		} elseif ( ! is_email( $record['party_email'] ?? '' ) ) {
			$notice = 'email_missing';
		} else {
			$label   = 'invoice' === $family ? __( 'Invoice', 'eazinvoice-billing-workspace-msmes' ) : ( 'wo' === ( $record['document_type'] ?? '' ) ? __( 'Work Order', 'eazinvoice-billing-workspace-msmes' ) : __( 'Purchase Order', 'eazinvoice-billing-workspace-msmes' ) );
			$subject = sprintf( '%1$s %2$s from %3$s', $label, $record['number'] ?? '', get_bloginfo( 'name' ) );
			$message = '<h2>' . esc_html( $label . ' ' . ( $record['number'] ?? '' ) ) . '</h2>';
			$message .= '<p>' . esc_html( sprintf( __( 'Hello %s,', 'eazinvoice-billing-workspace-msmes' ), $record['party_name'] ?? '' ) ) . '</p>';
			$message .= '<p>' . esc_html( sprintf( __( 'Total: %1$s %2$s', 'eazinvoice-billing-workspace-msmes' ), $record['currency'] ?? 'INR', number_format_i18n( (float) ( $record['total'] ?? 0 ), 2 ) ) ) . '</p>';
			$message .= '<p>' . esc_html( sprintf( __( 'Item: %s', 'eazinvoice-billing-workspace-msmes' ), $record['item_name'] ?? '' ) ) . '</p>';
			$message .= '<p>' . esc_html__( 'Please contact the sender if you need any clarification or a signed copy.', 'eazinvoice-billing-workspace-msmes' ) . '</p>';
			$sent    = wp_mail( sanitize_email( $record['party_email'] ), $subject, $message, array( 'Content-Type: text/html; charset=UTF-8' ) );
			$notice  = $sent ? 'email_sent' : 'email_failed';
		}

		wp_safe_redirect( add_query_arg( 'eazinvoice_document_notice', $notice, $redirect ) );
		exit;
	}

	/**
	 * Validate the saved EazInvoice API key against the live account.
	 */
	public function handle_validate_connection() {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'Permission denied.', 'eazinvoice-billing-workspace-msmes' ) );
		}

		check_admin_referer( 'eazinvoice_validate_connection' );

		$post     = wp_unslash( $_POST );
		$settings = $this->get_settings();
		$email    = sanitize_email( $post['account_email'] ?? $settings['account_email'] );
		$api_key  = sanitize_text_field( $post['api_key'] ?? $settings['api_key'] );
		$base_url = untrailingslashit( esc_url_raw( $post['api_base_url'] ?? $settings['api_base_url'] ) );

		$settings['account_email'] = $email;
		$settings['api_key']       = $api_key;
		$settings['api_base_url']  = $base_url;
		$settings['api_last_checked'] = current_time( 'mysql' );

		if ( empty( $email ) || empty( $api_key ) || empty( $base_url ) ) {
			$settings['api_status']  = 'not_connected';
			$settings['api_message'] = __( 'Enter account email, API key, and EazInvoice API base URL before validating.', 'eazinvoice-billing-workspace-msmes' );
			update_option( $this->option_name, $settings, false );
			wp_safe_redirect( add_query_arg( 'eazinvoice_connection', 'missing', admin_url( 'admin.php?page=eazinvoice-api-access' ) ) );
			exit;
		}

		$response = wp_remote_post(
			$base_url . '/wordpress/connection',
			array(
				'timeout' => 15,
				'headers' => array(
					'Content-Type' => 'application/json',
				),
				'body'    => wp_json_encode(
					array(
						'accountEmail' => $email,
						'apiKey'       => $api_key,
						'siteUrl'      => home_url(),
					)
				),
			)
		);

		if ( is_wp_error( $response ) ) {
			$settings['api_status']  = 'connection_failed';
			$settings['api_message'] = $response->get_error_message();
			update_option( $this->option_name, $settings, false );
			wp_safe_redirect( add_query_arg( 'eazinvoice_connection', 'failed', admin_url( 'admin.php?page=eazinvoice-api-access' ) ) );
			exit;
		}

		$body = json_decode( wp_remote_retrieve_body( $response ), true );
		if ( 200 !== wp_remote_retrieve_response_code( $response ) || empty( $body['ok'] ) ) {
			$settings['api_status']  = 'connection_failed';
			$settings['api_message'] = sanitize_text_field( $body['error'] ?? __( 'EazInvoice API validation failed.', 'eazinvoice-billing-workspace-msmes' ) );
			update_option( $this->option_name, $settings, false );
			wp_safe_redirect( add_query_arg( 'eazinvoice_connection', 'failed', admin_url( 'admin.php?page=eazinvoice-api-access' ) ) );
			exit;
		}

		$plan_id = sanitize_key( $body['plan']['id'] ?? 'free' );
		$settings['plan'] = in_array( $plan_id, array( 'free', 'standard', 'pro', 'business' ), true ) ? $plan_id : 'free';
		$settings['api_status'] = 'connected';
		$settings['api_message'] = sprintf(
			/* translators: %s: connected plan label. */
			__( 'Connected to EazInvoice. Active plan: %s.', 'eazinvoice-billing-workspace-msmes' ),
			sanitize_text_field( $body['plan']['label'] ?? strtoupper( $settings['plan'] ) )
		);
		$settings['gateway_status'] = ! empty( $body['wordpress']['gatewayReady'] ) ? 'available' : 'not_connected';
		update_option( $this->option_name, $settings, false );

		wp_safe_redirect( add_query_arg( 'eazinvoice_connection', 'connected', admin_url( 'admin.php?page=eazinvoice-api-access' ) ) );
		exit;
	}

	/**
	 * Return searchable plugin features.
	 *
	 * @return array<int, array<string, string>>
	 */
	private function get_feature_catalog() {
		return array(
			array(
				'label'       => __( 'Dashboard', 'eazinvoice-billing-workspace-msmes' ),
				'description' => __( 'Review local invoice and PO/WO records, totals, plan status, and workspace shortcuts.', 'eazinvoice-billing-workspace-msmes' ),
				'url'         => admin_url( 'admin.php?page=eazinvoice' ),
			),
			array(
				'label'       => __( 'Create Invoice', 'eazinvoice-billing-workspace-msmes' ),
				'description' => __( 'Create service or B2B invoice drafts and completed invoice records.', 'eazinvoice-billing-workspace-msmes' ),
				'url'         => $this->get_create_invoice_url(),
			),
			array(
				'label'       => __( 'Create PO / WO', 'eazinvoice-billing-workspace-msmes' ),
				'description' => __( 'Create purchase-order or work-order drafts and completed expense records.', 'eazinvoice-billing-workspace-msmes' ),
				'url'         => $this->get_create_po_url(),
			),
			array(
				'label'       => __( 'Subscription', 'eazinvoice-billing-workspace-msmes' ),
				'description' => __( 'Review Free, Standard, Pro, and Business plans and the connected subscription status.', 'eazinvoice-billing-workspace-msmes' ),
				'url'         => admin_url( 'admin.php?page=eazinvoice-subscription' ),
			),
			array(
				'label'       => __( 'API Access', 'eazinvoice-billing-workspace-msmes' ),
				'description' => __( 'Connect and validate this WordPress website with an EazInvoice API key.', 'eazinvoice-billing-workspace-msmes' ),
				'url'         => admin_url( 'admin.php?page=eazinvoice-api-access' ),
			),
			array(
				'label'       => __( 'Payment Gateway', 'eazinvoice-billing-workspace-msmes' ),
				'description' => __( 'Review Razorpay payment readiness for the connected paid EazInvoice plan.', 'eazinvoice-billing-workspace-msmes' ),
				'url'         => admin_url( 'admin.php?page=eazinvoice-payment-gateway' ),
			),
			array(
				'label'       => __( 'Settings', 'eazinvoice-billing-workspace-msmes' ),
				'description' => __( 'Manage account, workspace, API, public button, and button-position settings.', 'eazinvoice-billing-workspace-msmes' ),
				'url'         => admin_url( 'admin.php?page=eazinvoice-settings' ),
			),
			array(
				'label'       => __( 'SOP / Help', 'eazinvoice-billing-workspace-msmes' ),
				'description' => __( 'Open the operating guide for setup, invoices, PO/WO, connections, and releases.', 'eazinvoice-billing-workspace-msmes' ),
				'url'         => admin_url( 'admin.php?page=eazinvoice-help' ),
			),
			array(
				'label'       => __( 'Privacy and Data Use', 'eazinvoice-billing-workspace-msmes' ),
				'description' => __( 'Review what the plugin stores, when it connects externally, and site-owner responsibilities.', 'eazinvoice-billing-workspace-msmes' ),
				'url'         => admin_url( 'admin.php?page=eazinvoice-privacy' ),
			),
		);
	}

	/**
	 * Render internal plugin navigation.
	 *
	 * @param string $active Active page key.
	 */
	private function render_admin_nav( $active ) {
		$links = array(
			'dashboard'    => array( __( 'Dashboard', 'eazinvoice-billing-workspace-msmes' ), admin_url( 'admin.php?page=eazinvoice' ) ),
			'invoice'      => array( __( 'Create Invoice', 'eazinvoice-billing-workspace-msmes' ), $this->get_create_invoice_url() ),
			'po'           => array( __( 'Create PO / WO', 'eazinvoice-billing-workspace-msmes' ), $this->get_create_po_url() ),
			'subscription' => array( __( 'Subscription', 'eazinvoice-billing-workspace-msmes' ), admin_url( 'admin.php?page=eazinvoice-subscription' ) ),
			'api'          => array( __( 'API Access', 'eazinvoice-billing-workspace-msmes' ), admin_url( 'admin.php?page=eazinvoice-api-access' ) ),
			'gateway'      => array( __( 'Payment Gateway', 'eazinvoice-billing-workspace-msmes' ), admin_url( 'admin.php?page=eazinvoice-payment-gateway' ) ),
			'search'       => array( __( 'Find a Feature', 'eazinvoice-billing-workspace-msmes' ), admin_url( 'admin.php?page=eazinvoice-search' ) ),
			'settings'     => array( __( 'Settings', 'eazinvoice-billing-workspace-msmes' ), admin_url( 'admin.php?page=eazinvoice-settings' ) ),
			'help'         => array( __( 'SOP / Help', 'eazinvoice-billing-workspace-msmes' ), admin_url( 'admin.php?page=eazinvoice-help' ) ),
			'privacy'      => array( __( 'Privacy', 'eazinvoice-billing-workspace-msmes' ), admin_url( 'admin.php?page=eazinvoice-privacy' ) ),
		);

		$menu_id = 'eazinvoice-admin-menu-' . sanitize_html_class( $active );
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- This is a read-only feature search.
		$query   = isset( $_GET['eazinvoice_query'] ) ? sanitize_text_field( wp_unslash( $_GET['eazinvoice_query'] ) ) : '';

		echo '<div class="eazinvoice-admin-menu-wrap">';
		echo '<input class="eazinvoice-admin-menu-check" type="checkbox" id="' . esc_attr( $menu_id ) . '" />';
		echo '<label class="eazinvoice-admin-menu-toggle" for="' . esc_attr( $menu_id ) . '"><span class="eazinvoice-admin-menu-icon"><span></span><span></span><span></span></span><strong>' . esc_html__( 'Menu', 'eazinvoice-billing-workspace-msmes' ) . '</strong></label>';
		echo '<nav class="eazinvoice-admin-nav" aria-label="' . esc_attr__( 'EazInvoice sections', 'eazinvoice-billing-workspace-msmes' ) . '">';
		foreach ( $links as $key => $link ) {
			$class = $active === $key ? 'is-active' : '';
			echo '<a class="' . esc_attr( $class ) . '" href="' . esc_url( $link[1] ) . '">' . esc_html( $link[0] ) . '</a>';
		}
		echo '</nav>';
		echo '<form class="eazinvoice-admin-search" method="get" action="' . esc_url( admin_url( 'admin.php' ) ) . '">';
		echo '<input type="hidden" name="page" value="eazinvoice-search" />';
		echo '<label class="screen-reader-text" for="eazinvoice-feature-search-' . esc_attr( $active ) . '">' . esc_html__( 'Search EazInvoice features', 'eazinvoice-billing-workspace-msmes' ) . '</label>';
		echo '<input id="eazinvoice-feature-search-' . esc_attr( $active ) . '" type="search" name="eazinvoice_query" value="' . esc_attr( $query ) . '" placeholder="' . esc_attr__( 'Find a feature...', 'eazinvoice-billing-workspace-msmes' ) . '" />';
		echo '<button type="submit" class="eazinvoice-search-submit"><span class="dashicons dashicons-search" aria-hidden="true"></span><span>' . esc_html__( 'Search', 'eazinvoice-billing-workspace-msmes' ) . '</span></button>';
		echo '</form>';
		echo '</div>';
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
					<img src="<?php echo esc_url( EAZINVOICE_PLUGIN_URL . 'assets/eazinvoice-logo-full.png' ); ?>" alt="<?php esc_attr_e( 'EazInvoice', 'eazinvoice-billing-workspace-msmes' ); ?>" />
					<p><?php esc_html_e( 'Embedded EazInvoice workspace for this WordPress website. Free users can use the local invoice workspace; paid users will unlock deeper automation after license/API validation is added.', 'eazinvoice-billing-workspace-msmes' ); ?></p>
				</div>
				<a class="eazinvoice-button eazinvoice-button-primary" href="<?php echo esc_url( $this->get_create_invoice_url() ); ?>">
					<?php esc_html_e( 'Create Invoice', 'eazinvoice-billing-workspace-msmes' ); ?>
				</a>
			</section>

			<section class="eazinvoice-card">
				<div class="eazinvoice-section-head">
					<div>
						<h1><?php esc_html_e( 'Website Billing Workspace', 'eazinvoice-billing-workspace-msmes' ); ?></h1>
						<p><?php esc_html_e( 'This area is designed to work inside the customer WordPress website. Upgrade/payment links can open EazInvoice, but day-to-day invoice actions should remain embedded here.', 'eazinvoice-billing-workspace-msmes' ); ?></p>
					</div>
					<span class="eazinvoice-plan-pill"><?php echo esc_html( strtoupper( $settings['plan'] ) ); ?></span>
				</div>
				<div class="eazinvoice-workspace-grid">
					<a class="eazinvoice-workspace-tile" href="<?php echo esc_url( $this->get_create_invoice_url() ); ?>">
						<strong><?php esc_html_e( 'Create Invoice', 'eazinvoice-billing-workspace-msmes' ); ?></strong>
						<span><?php esc_html_e( 'Open the embedded invoice form for service and B2B billing.', 'eazinvoice-billing-workspace-msmes' ); ?></span>
					</a>
					<a class="eazinvoice-workspace-tile" href="<?php echo esc_url( $this->get_create_po_url() ); ?>">
						<strong><?php esc_html_e( 'Create PO / WO', 'eazinvoice-billing-workspace-msmes' ); ?></strong>
						<span><?php esc_html_e( 'Create purchase orders and work orders for expense-side records.', 'eazinvoice-billing-workspace-msmes' ); ?></span>
					</a>
					<a class="eazinvoice-workspace-tile" href="<?php echo esc_url( admin_url( 'admin.php?page=eazinvoice-subscription' ) ); ?>">
						<strong><?php esc_html_e( 'Subscription', 'eazinvoice-billing-workspace-msmes' ); ?></strong>
						<span><?php esc_html_e( 'See current free tier and paid feature upgrade path.', 'eazinvoice-billing-workspace-msmes' ); ?></span>
					</a>
					<a class="eazinvoice-workspace-tile" href="<?php echo esc_url( admin_url( 'admin.php?page=eazinvoice-settings' ) ); ?>">
						<strong><?php esc_html_e( 'Settings', 'eazinvoice-billing-workspace-msmes' ); ?></strong>
						<span><?php esc_html_e( 'Control the automatic site button, account email, and license/API details.', 'eazinvoice-billing-workspace-msmes' ); ?></span>
					</a>
					<a class="eazinvoice-workspace-tile" href="<?php echo esc_url( admin_url( 'admin.php?page=eazinvoice-api-access' ) ); ?>">
						<strong><?php esc_html_e( 'API Access', 'eazinvoice-billing-workspace-msmes' ); ?></strong>
						<span><?php esc_html_e( 'Connect this WordPress site to the customer EazInvoice subscription.', 'eazinvoice-billing-workspace-msmes' ); ?></span>
					</a>
				</div>
			</section>

			<section class="eazinvoice-card">
				<h1><?php esc_html_e( 'Free Tier Summary', 'eazinvoice-billing-workspace-msmes' ); ?></h1>
				<div class="eazinvoice-metric-grid">
					<article><span><?php esc_html_e( 'Invoice Drafts', 'eazinvoice-billing-workspace-msmes' ); ?></span><strong><?php echo esc_html( count( array_filter( $invoices, fn( $record ) => 'draft' === ( $record['status'] ?? '' ) ) ) ); ?></strong></article>
					<article><span><?php esc_html_e( 'Created Invoices', 'eazinvoice-billing-workspace-msmes' ); ?></span><strong><?php echo esc_html( count( array_filter( $invoices, fn( $record ) => 'created' === ( $record['status'] ?? '' ) ) ) ); ?></strong></article>
					<article><span><?php esc_html_e( 'PO / WO Drafts', 'eazinvoice-billing-workspace-msmes' ); ?></span><strong><?php echo esc_html( count( array_filter( $orders, fn( $record ) => 'draft' === ( $record['status'] ?? '' ) ) ) ); ?></strong></article>
					<article><span><?php esc_html_e( 'Created PO / WO', 'eazinvoice-billing-workspace-msmes' ); ?></span><strong><?php echo esc_html( count( array_filter( $orders, fn( $record ) => 'created' === ( $record['status'] ?? '' ) ) ) ); ?></strong></article>
					<article><span><?php esc_html_e( 'Income', 'eazinvoice-billing-workspace-msmes' ); ?></span><strong><?php echo esc_html( 'INR ' . number_format_i18n( $created_income, 2 ) ); ?></strong></article>
					<article><span><?php esc_html_e( 'Expenses', 'eazinvoice-billing-workspace-msmes' ); ?></span><strong><?php echo esc_html( 'INR ' . number_format_i18n( $created_expense, 2 ) ); ?></strong></article>
				</div>
			</section>
		</div>
		<?php
	}

	/**
	 * Render a document saved notice.
	 */
	private function render_saved_notice() {
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Read-only admin notice after a nonce-validated action redirect.
		$document_notice = sanitize_key( wp_unslash( $_GET['eazinvoice_document_notice'] ?? '' ) );
		$document_messages = array(
			'email_sent'      => array( 'success', __( 'Document emailed successfully.', 'eazinvoice-billing-workspace-msmes' ) ),
			'email_failed'    => array( 'error', __( 'WordPress could not send this email. Check the website mail or SMTP configuration and try again.', 'eazinvoice-billing-workspace-msmes' ) ),
			'email_upgrade'   => array( 'warning', __( 'Document email sharing is available on Standard, Pro, and Business plans.', 'eazinvoice-billing-workspace-msmes' ) ),
			'email_missing'   => array( 'warning', __( 'Add a valid customer or vendor email before sending this document.', 'eazinvoice-billing-workspace-msmes' ) ),
			'email_not_found' => array( 'error', __( 'The selected document could not be found.', 'eazinvoice-billing-workspace-msmes' ) ),
		);
		if ( isset( $document_messages[ $document_notice ] ) ) {
			$message = $document_messages[ $document_notice ];
			echo '<div class="notice notice-' . esc_attr( $message[0] ) . ' is-dismissible"><p>' . esc_html( $message[1] ) . '</p></div>';
		}

		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Read-only admin notice parameters after a nonce-validated redirect.
		if ( empty( $_GET['eazinvoice_saved'] ) ) {
			return;
		}

		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Read-only admin notice parameters after a nonce-validated redirect.
		$saved_status = sanitize_key( wp_unslash( $_GET['eazinvoice_saved'] ) );
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Read-only admin notice parameters after a nonce-validated redirect.
		$status       = 'created' === $saved_status ? __( 'created', 'eazinvoice-billing-workspace-msmes' ) : __( 'saved as draft', 'eazinvoice-billing-workspace-msmes' );
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Read-only admin notice parameters after a nonce-validated redirect.
		$number = sanitize_text_field( wp_unslash( $_GET['eazinvoice_no'] ?? '' ) );

		/* translators: 1: document number, 2: saved status. */
		echo '<div class="notice notice-success is-dismissible"><p>' . esc_html( sprintf( __( '%1$s %2$s successfully.', 'eazinvoice-billing-workspace-msmes' ), $number, $status ) ) . '</p></div>';
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
		$title       = $is_po ? __( 'Create Purchase Order / Work Order Inside WordPress', 'eazinvoice-billing-workspace-msmes' ) : __( 'Create Invoice Inside WordPress', 'eazinvoice-billing-workspace-msmes' );
		$description = $is_po
			? __( 'Create PO or WO records for vendors, service providers, procurement, and expense tracking.', 'eazinvoice-billing-workspace-msmes' )
			: __( 'Create invoice records for service and B2B billing from inside WordPress.', 'eazinvoice-billing-workspace-msmes' );
		?>
		<?php $this->render_saved_notice(); ?>
		<section class="eazinvoice-card">
			<span class="eazinvoice-plan-pill"><?php esc_html_e( 'Free embedded workspace', 'eazinvoice-billing-workspace-msmes' ); ?></span>
			<h1><?php echo esc_html( $title ); ?></h1>
			<p><?php echo esc_html( $description ); ?></p>
			<form class="eazinvoice-mini-form" method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
				<?php wp_nonce_field( 'eazinvoice_save_document' ); ?>
				<input type="hidden" name="action" value="eazinvoice_save_document" />
				<input type="hidden" name="document_family" value="<?php echo esc_attr( $family ); ?>" />
				<?php if ( $is_po ) : ?>
					<label>
						<?php esc_html_e( 'Document Type', 'eazinvoice-billing-workspace-msmes' ); ?>
						<select name="document_type">
							<option value="po"><?php esc_html_e( 'Purchase Order', 'eazinvoice-billing-workspace-msmes' ); ?></option>
							<option value="wo"><?php esc_html_e( 'Work Order', 'eazinvoice-billing-workspace-msmes' ); ?></option>
						</select>
					</label>
				<?php endif; ?>
				<label>
					<?php echo esc_html( $is_po ? __( 'Vendor / Supplier Name', 'eazinvoice-billing-workspace-msmes' ) : __( 'Customer / Business Name', 'eazinvoice-billing-workspace-msmes' ) ); ?>
					<input name="party_name" type="text" required placeholder="<?php echo esc_attr( $is_po ? __( 'ABC Suppliers', 'eazinvoice-billing-workspace-msmes' ) : __( 'ABC Consultants', 'eazinvoice-billing-workspace-msmes' ) ); ?>" />
				</label>
				<label>
					<?php echo esc_html( $is_po ? __( 'Vendor Email', 'eazinvoice-billing-workspace-msmes' ) : __( 'Customer Email', 'eazinvoice-billing-workspace-msmes' ) ); ?>
					<input name="party_email" type="email" placeholder="<?php esc_attr_e( 'billing@example.com', 'eazinvoice-billing-workspace-msmes' ); ?>" />
				</label>
				<label>
					<?php esc_html_e( 'Currency', 'eazinvoice-billing-workspace-msmes' ); ?>
					<select name="currency">
						<option value="INR"><?php esc_html_e( 'INR - Indian Rupee', 'eazinvoice-billing-workspace-msmes' ); ?></option>
						<option value="USD"><?php esc_html_e( 'USD - US Dollar', 'eazinvoice-billing-workspace-msmes' ); ?></option>
						<option value="AUD"><?php esc_html_e( 'AUD - Australian Dollar', 'eazinvoice-billing-workspace-msmes' ); ?></option>
						<option value="EUR"><?php esc_html_e( 'EUR - Euro', 'eazinvoice-billing-workspace-msmes' ); ?></option>
						<option value="GBP"><?php esc_html_e( 'GBP - Pound Sterling', 'eazinvoice-billing-workspace-msmes' ); ?></option>
					</select>
				</label>
				<label>
					<?php esc_html_e( 'Goods / Service', 'eazinvoice-billing-workspace-msmes' ); ?>
					<input name="item_name" type="text" required placeholder="<?php esc_attr_e( 'Website design service', 'eazinvoice-billing-workspace-msmes' ); ?>" />
				</label>
				<label>
					<?php esc_html_e( 'HSN/SAC / Tax Code', 'eazinvoice-billing-workspace-msmes' ); ?>
					<input name="item_code" type="text" placeholder="<?php esc_attr_e( '9983', 'eazinvoice-billing-workspace-msmes' ); ?>" />
				</label>
				<label>
					<?php esc_html_e( 'Quantity', 'eazinvoice-billing-workspace-msmes' ); ?>
					<input name="quantity" type="number" min="0" step="0.01" value="1" required />
				</label>
				<label>
					<?php esc_html_e( 'Rate', 'eazinvoice-billing-workspace-msmes' ); ?>
					<input name="rate" type="number" min="0" step="0.01" value="0" required />
				</label>
				<label>
					<?php esc_html_e( 'Discount In Amount', 'eazinvoice-billing-workspace-msmes' ); ?>
					<input name="discount" type="number" min="0" step="0.01" value="0" />
				</label>
				<label>
					<?php esc_html_e( 'GST / Tax %', 'eazinvoice-billing-workspace-msmes' ); ?>
					<input name="tax_rate" type="number" min="0" step="0.01" value="18" />
				</label>
				<div class="eazinvoice-form-actions">
					<button class="eazinvoice-button eazinvoice-button-secondary" type="submit" name="document_status" value="draft"><?php esc_html_e( 'Save Draft', 'eazinvoice-billing-workspace-msmes' ); ?></button>
					<button class="eazinvoice-button eazinvoice-button-primary" type="submit" name="document_status" value="created"><?php echo esc_html( $is_po ? __( 'Create PO / WO', 'eazinvoice-billing-workspace-msmes' ) : __( 'Create Invoice', 'eazinvoice-billing-workspace-msmes' ) ); ?></button>
				</div>
			</form>
		</section>

		<section class="eazinvoice-card">
			<h2><?php echo esc_html( $is_po ? __( 'PO / WO Records', 'eazinvoice-billing-workspace-msmes' ) : __( 'Invoice Records', 'eazinvoice-billing-workspace-msmes' ) ); ?></h2>
			<?php if ( empty( $list ) ) : ?>
				<div class="eazinvoice-notice-soft"><?php esc_html_e( 'No records yet. Save a draft or create a document to see it here.', 'eazinvoice-billing-workspace-msmes' ); ?></div>
			<?php else : ?>
				<div class="eazinvoice-record-list">
					<?php foreach ( array_reverse( $list ) as $record ) : ?>
						<article>
							<div class="eazinvoice-record-summary">
								<strong><?php echo esc_html( $record['number'] ?? '' ); ?></strong>
								<span><?php echo esc_html( ( $record['party_name'] ?? '' ) . ' - ' . ( $record['currency'] ?? 'INR' ) . ' ' . number_format_i18n( (float) ( $record['total'] ?? 0 ), 2 ) ); ?></span>
							</div>
							<div class="eazinvoice-record-actions">
								<mark class="eazinvoice-status-<?php echo esc_attr( $record['status'] ?? 'draft' ); ?>"><?php echo esc_html( strtoupper( $record['status'] ?? 'draft' ) ); ?></mark>
								<a class="button" target="_blank" rel="noopener" href="<?php echo esc_url( wp_nonce_url( admin_url( 'admin-post.php?action=eazinvoice_print_document&family=' . rawurlencode( $family ) . '&record_id=' . rawurlencode( $record['id'] ?? '' ) ), 'eazinvoice_print_document_' . ( $record['id'] ?? '' ) ) ); ?>"><?php esc_html_e( 'Print / Save as PDF', 'eazinvoice-billing-workspace-msmes' ); ?></a>
								<?php if ( $this->plan_at_least( 'standard' ) ) : ?>
									<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
										<input type="hidden" name="action" value="eazinvoice_email_document" />
										<input type="hidden" name="family" value="<?php echo esc_attr( $family ); ?>" />
										<input type="hidden" name="record_id" value="<?php echo esc_attr( $record['id'] ?? '' ); ?>" />
										<?php wp_nonce_field( 'eazinvoice_email_document_' . ( $record['id'] ?? '' ) ); ?>
										<button class="button" type="submit"<?php disabled( empty( $record['party_email'] ) ); ?>><?php esc_html_e( 'Email', 'eazinvoice-billing-workspace-msmes' ); ?></button>
									</form>
								<?php else : ?>
									<span class="eazinvoice-feature-lock"><?php esc_html_e( 'Email: Standard+', 'eazinvoice-billing-workspace-msmes' ); ?></span>
								<?php endif; ?>
							</div>
						</article>
					<?php endforeach; ?>
				</div>
			<?php endif; ?>
		</section>
		<script>
			(function () {
				var form = document.querySelector('.eazinvoice-mini-form');
				if (!form) {
					return;
				}
				var dirty = false;
				var submitted = false;
				form.addEventListener('input', function () {
					dirty = true;
				});
				form.addEventListener('change', function () {
					dirty = true;
				});
				form.addEventListener('submit', function () {
					submitted = true;
				});
				window.addEventListener('beforeunload', function (event) {
					if (!dirty || submitted) {
						return;
					}
					event.preventDefault();
					event.returnValue = '';
				});
				document.querySelectorAll('.eazinvoice-admin-nav a').forEach(function (link) {
					link.addEventListener('click', function (event) {
						if (!dirty || submitted) {
							return;
						}
						if (!window.confirm('Discard unsaved changes?\n\nYou have unsaved changes. Going back will discard them.')) {
							event.preventDefault();
						}
					});
				});
			}());
		</script>
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
						<h1><?php esc_html_e( 'Subscription And Plugin Features', 'eazinvoice-billing-workspace-msmes' ); ?></h1>
						<p><?php esc_html_e( 'Free tier is available inside this WordPress website after plugin activation. Paid features should unlock here after upgrade and plugin/license refresh.', 'eazinvoice-billing-workspace-msmes' ); ?></p>
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
									<?php esc_html_e( 'Upgrade On EazInvoice', 'eazinvoice-billing-workspace-msmes' ); ?>
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
		$status_label = 'connected' === $settings['api_status']
			? __( 'Connected', 'eazinvoice-billing-workspace-msmes' )
			: ( $is_connected ? __( 'API key saved - validate connection', 'eazinvoice-billing-workspace-msmes' ) : __( 'Not connected', 'eazinvoice-billing-workspace-msmes' ) );
		?>
		<div class="wrap eazinvoice-admin">
			<?php $this->render_admin_nav( 'api' ); ?>
			<section class="eazinvoice-hero">
				<div>
					<img src="<?php echo esc_url( EAZINVOICE_PLUGIN_URL . 'assets/eazinvoice-logo-full.png' ); ?>" alt="<?php esc_attr_e( 'EazInvoice', 'eazinvoice-billing-workspace-msmes' ); ?>" />
					<p><?php esc_html_e( 'Connect this WordPress website to the customer EazInvoice account. Generate the API key from the logged-in EazInvoice account, then paste it here.', 'eazinvoice-billing-workspace-msmes' ); ?></p>
				</div>
				<a class="eazinvoice-button eazinvoice-button-primary" href="<?php echo esc_url( $settings['api_settings_url'] ); ?>" target="_blank" rel="noopener noreferrer">
					<?php esc_html_e( 'Open EazInvoice API Settings', 'eazinvoice-billing-workspace-msmes' ); ?>
				</a>
			</section>

			<section class="eazinvoice-card">
				<div class="eazinvoice-section-head">
					<div>
						<h1><?php esc_html_e( 'Connect EazInvoice Account', 'eazinvoice-billing-workspace-msmes' ); ?></h1>
						<p><?php esc_html_e( 'The customer should log in to EazInvoice, generate a WordPress API key, and paste it below. The validation check updates the local plan and paid feature display inside WordPress.', 'eazinvoice-billing-workspace-msmes' ); ?></p>
					</div>
					<span class="eazinvoice-plan-pill"><?php echo esc_html( $status_label ); ?></span>
				</div>
				<?php if ( ! empty( $settings['api_message'] ) ) : ?>
					<div class="eazinvoice-notice-soft"><?php echo esc_html( $settings['api_message'] ); ?></div>
				<?php endif; ?>
				<form method="post" action="options.php">
					<?php settings_fields( 'eazinvoice_settings_group' ); ?>
					<table class="form-table" role="presentation">
						<tr>
							<th scope="row"><label for="eazinvoice_account_email_api"><?php esc_html_e( 'EazInvoice Account Email', 'eazinvoice-billing-workspace-msmes' ); ?></label></th>
							<td><input id="eazinvoice_account_email_api" class="regular-text" type="email" name="eazinvoice_settings[account_email]" value="<?php echo esc_attr( $settings['account_email'] ); ?>" /></td>
						</tr>
						<tr>
							<th scope="row"><label for="eazinvoice_api_key_api"><?php esc_html_e( 'WordPress API Key', 'eazinvoice-billing-workspace-msmes' ); ?></label></th>
							<td>
								<input id="eazinvoice_api_key_api" class="regular-text" type="password" name="eazinvoice_settings[api_key]" value="" placeholder="<?php echo esc_attr( empty( $settings['api_key'] ) ? __( 'Paste WordPress API key', 'eazinvoice-billing-workspace-msmes' ) : __( 'API key saved - leave blank to keep it', 'eazinvoice-billing-workspace-msmes' ) ); ?>" autocomplete="off" />
								<p class="description"><?php esc_html_e( 'For security, saved keys are not printed back into this page.', 'eazinvoice-billing-workspace-msmes' ); ?></p>
							</td>
						</tr>
						<tr>
							<th scope="row"><label for="eazinvoice_api_base_url"><?php esc_html_e( 'EazInvoice API Base URL', 'eazinvoice-billing-workspace-msmes' ); ?></label></th>
							<td>
								<input id="eazinvoice_api_base_url" class="regular-text" type="url" name="eazinvoice_settings[api_base_url]" value="<?php echo esc_url( $settings['api_base_url'] ); ?>" />
								<p class="description"><?php esc_html_e( 'Use https://www.eazinvoice.com for live websites, or localhost only for local development.', 'eazinvoice-billing-workspace-msmes' ); ?></p>
							</td>
						</tr>
						<tr>
							<th scope="row"><label for="eazinvoice_api_settings_url"><?php esc_html_e( 'EazInvoice API Settings URL', 'eazinvoice-billing-workspace-msmes' ); ?></label></th>
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
					printf(
						'<input type="hidden" name="eazinvoice_settings[api_status]" value="%s" />',
						esc_attr( $settings['api_status'] )
					);
					printf(
						'<input type="hidden" name="eazinvoice_settings[api_message]" value="%s" />',
						esc_attr( $settings['api_message'] )
					);
					printf(
						'<input type="hidden" name="eazinvoice_settings[gateway_status]" value="%s" />',
						esc_attr( $settings['gateway_status'] )
					);
					if ( '1' === $settings['auto_button'] ) {
						echo '<input type="hidden" name="eazinvoice_settings[auto_button]" value="1" />';
					}
					submit_button( __( 'Save API Connection', 'eazinvoice-billing-workspace-msmes' ) );
					?>
				</form>
				<div class="eazinvoice-steps">
					<article><span>1</span><strong><?php esc_html_e( 'Open EazInvoice', 'eazinvoice-billing-workspace-msmes' ); ?></strong><p><?php esc_html_e( 'Log in to the customer account that owns the subscription.', 'eazinvoice-billing-workspace-msmes' ); ?></p></article>
					<article><span>2</span><strong><?php esc_html_e( 'Generate API Key', 'eazinvoice-billing-workspace-msmes' ); ?></strong><p><?php esc_html_e( 'Use Account Settings > API / WordPress Integration.', 'eazinvoice-billing-workspace-msmes' ); ?></p></article>
					<article><span>3</span><strong><?php esc_html_e( 'Paste Key Here', 'eazinvoice-billing-workspace-msmes' ); ?></strong><p><?php esc_html_e( 'Save it in the plugin, then run live validation against the connected EazInvoice account.', 'eazinvoice-billing-workspace-msmes' ); ?></p></article>
					<article><span>4</span><strong><?php esc_html_e( 'Unlock Features', 'eazinvoice-billing-workspace-msmes' ); ?></strong><p><?php esc_html_e( 'The plugin will unlock features based on the subscription returned by EazInvoice.', 'eazinvoice-billing-workspace-msmes' ); ?></p></article>
				</div>
				<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" class="eazinvoice-inline-action">
					<?php wp_nonce_field( 'eazinvoice_validate_connection' ); ?>
					<input type="hidden" name="action" value="eazinvoice_validate_connection" />
					<input type="hidden" name="account_email" value="<?php echo esc_attr( $settings['account_email'] ); ?>" />
					<input type="hidden" name="api_base_url" value="<?php echo esc_url( $settings['api_base_url'] ); ?>" />
					<button class="eazinvoice-button eazinvoice-button-primary" type="submit"><?php esc_html_e( 'Validate EazInvoice Connection', 'eazinvoice-billing-workspace-msmes' ); ?></button>
				</form>
			</section>
		</div>
		<?php
	}

	/**
	 * Render payment gateway readiness page.
	 */
	public function render_payment_gateway_page() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}

		$settings      = $this->get_settings();
		$gateway_ready = in_array( $settings['plan'], array( 'standard', 'pro', 'business' ), true ) && 'connected' === $settings['api_status'];
		?>
		<div class="wrap eazinvoice-admin">
			<?php $this->render_admin_nav( 'gateway' ); ?>
			<section class="eazinvoice-hero">
				<div>
					<img src="<?php echo esc_url( EAZINVOICE_PLUGIN_URL . 'assets/eazinvoice-logo-full.png' ); ?>" alt="<?php esc_attr_e( 'EazInvoice', 'eazinvoice-billing-workspace-msmes' ); ?>" />
					<p><?php esc_html_e( 'Razorpay live collection should be configured inside the EazInvoice Business/Gateway settings. This WordPress plugin never exposes Razorpay secrets on the public website.', 'eazinvoice-billing-workspace-msmes' ); ?></p>
				</div>
				<a class="eazinvoice-button eazinvoice-button-primary" href="<?php echo esc_url( $settings['upgrade_url'] ); ?>#pricing" target="_blank" rel="noopener noreferrer">
					<?php esc_html_e( 'View Paid Tiers', 'eazinvoice-billing-workspace-msmes' ); ?>
				</a>
			</section>

			<section class="eazinvoice-card">
				<div class="eazinvoice-section-head">
					<div>
						<h1><?php esc_html_e( 'Payment Gateway Readiness', 'eazinvoice-billing-workspace-msmes' ); ?></h1>
						<p><?php esc_html_e( 'Standard, Pro, and Business tiers can use payment collection flows after the EazInvoice account is connected and Razorpay live keys/webhook are configured on EazInvoice.', 'eazinvoice-billing-workspace-msmes' ); ?></p>
					</div>
					<span class="eazinvoice-plan-pill"><?php echo esc_html( $gateway_ready ? __( 'Gateway available', 'eazinvoice-billing-workspace-msmes' ) : __( 'Connect paid plan', 'eazinvoice-billing-workspace-msmes' ) ); ?></span>
				</div>
				<div class="eazinvoice-workspace-grid">
					<article class="eazinvoice-workspace-tile">
						<strong><?php esc_html_e( '1. Connect Account', 'eazinvoice-billing-workspace-msmes' ); ?></strong>
						<span><?php esc_html_e( 'Paste and validate the WordPress API key from the subscribed EazInvoice account.', 'eazinvoice-billing-workspace-msmes' ); ?></span>
					</article>
					<article class="eazinvoice-workspace-tile">
						<strong><?php esc_html_e( '2. Configure Razorpay', 'eazinvoice-billing-workspace-msmes' ); ?></strong>
						<span><?php esc_html_e( 'Add live Razorpay Key ID, Key Secret, and webhook secret in EazInvoice admin/business gateway settings.', 'eazinvoice-billing-workspace-msmes' ); ?></span>
					</article>
					<article class="eazinvoice-workspace-tile">
						<strong><?php esc_html_e( '3. Collect Payments', 'eazinvoice-billing-workspace-msmes' ); ?></strong>
						<span><?php esc_html_e( 'Created invoices can use EazInvoice payment links, and successful payments update invoice status after signed verification.', 'eazinvoice-billing-workspace-msmes' ); ?></span>
					</article>
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
					<img src="<?php echo esc_url( EAZINVOICE_PLUGIN_URL . 'assets/eazinvoice-logo-full.png' ); ?>" alt="<?php esc_attr_e( 'EazInvoice', 'eazinvoice-billing-workspace-msmes' ); ?>" />
					<p><?php esc_html_e( 'Control how EazInvoice appears inside this WordPress website.', 'eazinvoice-billing-workspace-msmes' ); ?></p>
				</div>
				<a class="eazinvoice-button eazinvoice-button-primary" href="<?php echo esc_url( $this->get_create_invoice_url() ); ?>">
					<?php esc_html_e( 'Open Create Invoice', 'eazinvoice-billing-workspace-msmes' ); ?>
				</a>
			</div>

			<section class="eazinvoice-card">
				<h1><?php esc_html_e( 'Free Plugin Setup', 'eazinvoice-billing-workspace-msmes' ); ?></h1>
				<p><?php esc_html_e( 'Use these settings for the active free plugin button. The button opens the embedded WordPress invoice page. Upgrade links can open the EazInvoice pricing page.', 'eazinvoice-billing-workspace-msmes' ); ?></p>
				<form method="post" action="options.php">
					<?php settings_fields( 'eazinvoice_settings_group' ); ?>
					<table class="form-table" role="presentation">
						<tr>
							<th scope="row"><label for="eazinvoice_account_email"><?php esc_html_e( 'Account Email', 'eazinvoice-billing-workspace-msmes' ); ?></label></th>
							<td><input id="eazinvoice_account_email" class="regular-text" type="email" name="eazinvoice_settings[account_email]" value="<?php echo esc_attr( $settings['account_email'] ); ?>" /></td>
						</tr>
						<tr>
							<th scope="row"><label for="eazinvoice_api_key"><?php esc_html_e( 'API Key', 'eazinvoice-billing-workspace-msmes' ); ?></label></th>
							<td>
								<input id="eazinvoice_api_key" class="regular-text" type="password" name="eazinvoice_settings[api_key]" value="" placeholder="<?php echo esc_attr( empty( $settings['api_key'] ) ? __( 'Paste WordPress API key', 'eazinvoice-billing-workspace-msmes' ) : __( 'API key saved - leave blank to keep it', 'eazinvoice-billing-workspace-msmes' ) ); ?>" autocomplete="off" />
								<p class="description"><?php esc_html_e( 'For security, saved keys are not printed back into this page.', 'eazinvoice-billing-workspace-msmes' ); ?></p>
								<p><a href="<?php echo esc_url( admin_url( 'admin.php?page=eazinvoice-api-access' ) ); ?>"><?php esc_html_e( 'Use API Access page for connection steps', 'eazinvoice-billing-workspace-msmes' ); ?></a></p>
							</td>
						</tr>
						<tr>
							<th scope="row"><label for="eazinvoice_workspace_url"><?php esc_html_e( 'Legacy Workspace URL', 'eazinvoice-billing-workspace-msmes' ); ?></label></th>
							<td><input id="eazinvoice_workspace_url" class="regular-text" type="url" name="eazinvoice_settings[workspace_url]" value="<?php echo esc_url( $settings['workspace_url'] ); ?>" /></td>
						</tr>
						<tr>
							<th scope="row"><label for="eazinvoice_api_base_url_settings"><?php esc_html_e( 'EazInvoice API Base URL', 'eazinvoice-billing-workspace-msmes' ); ?></label></th>
							<td><input id="eazinvoice_api_base_url_settings" class="regular-text" type="url" name="eazinvoice_settings[api_base_url]" value="<?php echo esc_url( $settings['api_base_url'] ); ?>" /></td>
						</tr>
						<tr>
							<th scope="row"><label for="eazinvoice_upgrade_url"><?php esc_html_e( 'Upgrade / Pricing URL', 'eazinvoice-billing-workspace-msmes' ); ?></label></th>
							<td><input id="eazinvoice_upgrade_url" class="regular-text" type="url" name="eazinvoice_settings[upgrade_url]" value="<?php echo esc_url( $settings['upgrade_url'] ); ?>" /></td>
						</tr>
						<tr>
							<th scope="row"><label for="eazinvoice_api_settings_url_settings"><?php esc_html_e( 'API Settings URL', 'eazinvoice-billing-workspace-msmes' ); ?></label></th>
							<td><input id="eazinvoice_api_settings_url_settings" class="regular-text" type="url" name="eazinvoice_settings[api_settings_url]" value="<?php echo esc_url( $settings['api_settings_url'] ); ?>" /></td>
						</tr>
						<tr>
							<th scope="row"><label for="eazinvoice_button_label"><?php esc_html_e( 'Button Label', 'eazinvoice-billing-workspace-msmes' ); ?></label></th>
							<td><input id="eazinvoice_button_label" class="regular-text" type="text" name="eazinvoice_settings[button_label]" value="<?php echo esc_attr( $settings['button_label'] ); ?>" /></td>
						</tr>
						<tr>
							<th scope="row"><?php esc_html_e( 'Automatic Site Button', 'eazinvoice-billing-workspace-msmes' ); ?></th>
							<td>
								<label>
									<input type="checkbox" name="eazinvoice_settings[auto_button]" value="1" <?php checked( '1', $settings['auto_button'] ); ?> />
									<?php esc_html_e( 'Show EazInvoice button automatically on the public website', 'eazinvoice-billing-workspace-msmes' ); ?>
								</label>
							</td>
						</tr>
						<tr>
							<th scope="row"><label for="eazinvoice_button_position"><?php esc_html_e( 'Button Position', 'eazinvoice-billing-workspace-msmes' ); ?></label></th>
							<td>
								<select id="eazinvoice_button_position" name="eazinvoice_settings[button_position]">
									<option value="bottom-right" <?php selected( 'bottom-right', $settings['button_position'] ); ?>><?php esc_html_e( 'Bottom right', 'eazinvoice-billing-workspace-msmes' ); ?></option>
									<option value="bottom-left" <?php selected( 'bottom-left', $settings['button_position'] ); ?>><?php esc_html_e( 'Bottom left', 'eazinvoice-billing-workspace-msmes' ); ?></option>
								</select>
							</td>
						</tr>
					</table>
					<input type="hidden" name="eazinvoice_settings[api_status]" value="<?php echo esc_attr( $settings['api_status'] ); ?>" />
					<input type="hidden" name="eazinvoice_settings[api_message]" value="<?php echo esc_attr( $settings['api_message'] ); ?>" />
					<input type="hidden" name="eazinvoice_settings[api_last_checked]" value="<?php echo esc_attr( $settings['api_last_checked'] ); ?>" />
					<input type="hidden" name="eazinvoice_settings[plan]" value="<?php echo esc_attr( $settings['plan'] ); ?>" />
					<input type="hidden" name="eazinvoice_settings[gateway_status]" value="<?php echo esc_attr( $settings['gateway_status'] ); ?>" />
					<?php submit_button( __( 'Save Free Plugin Settings', 'eazinvoice-billing-workspace-msmes' ) ); ?>
				</form>
			</section>

			<section class="eazinvoice-card">
				<h2><?php esc_html_e( 'Shortcode', 'eazinvoice-billing-workspace-msmes' ); ?></h2>
				<p><code>[eazinvoice_button]</code></p>
				<p><?php esc_html_e( 'Optional: place this shortcode on any WordPress page when you want a button inside page content in addition to the automatic site button.', 'eazinvoice-billing-workspace-msmes' ); ?></p>
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

		$url   = (string) $atts['url'];
		$label = (string) $atts['label'];

		return '<div class="eazinvoice-shortcode"><a class="eazinvoice-shortcode-button" href="' . esc_url( $url ) . '" target="_blank" rel="noopener noreferrer">' . esc_html( $label ) . '</a></div>';
	}

	/**
	 * Render searchable feature directory.
	 */
	public function render_search_page() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}

		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- This is a read-only feature search.
		$query   = isset( $_GET['eazinvoice_query'] ) ? sanitize_text_field( wp_unslash( $_GET['eazinvoice_query'] ) ) : '';
		$catalog = $this->get_feature_catalog();
		$results = array_filter(
			$catalog,
			static function ( $feature ) use ( $query ) {
				if ( '' === $query ) {
					return true;
				}

				$searchable = $feature['label'] . ' ' . $feature['description'];
				return false !== stripos( $searchable, $query );
			}
		);
		?>
		<div class="wrap eazinvoice-admin">
			<?php $this->render_admin_nav( 'search' ); ?>
			<section class="eazinvoice-hero eazinvoice-search-hero">
				<div>
					<p class="eazinvoice-kicker"><?php esc_html_e( 'Feature navigator', 'eazinvoice-billing-workspace-msmes' ); ?></p>
					<h1><?php esc_html_e( 'Find anything in EazInvoice', 'eazinvoice-billing-workspace-msmes' ); ?></h1>
					<p><?php esc_html_e( 'Search the plugin workspace without leaving WordPress.', 'eazinvoice-billing-workspace-msmes' ); ?></p>
				</div>
			</section>
			<section class="eazinvoice-card">
				<form class="eazinvoice-feature-search-form" method="get" action="<?php echo esc_url( admin_url( 'admin.php' ) ); ?>">
					<input type="hidden" name="page" value="eazinvoice-search" />
					<label for="eazinvoice-feature-search-page"><?php esc_html_e( 'What do you need?', 'eazinvoice-billing-workspace-msmes' ); ?></label>
					<div>
						<input id="eazinvoice-feature-search-page" type="search" name="eazinvoice_query" value="<?php echo esc_attr( $query ); ?>" placeholder="<?php esc_attr_e( 'Try invoice, API, privacy, payment, or help', 'eazinvoice-billing-workspace-msmes' ); ?>" autofocus />
						<button class="eazinvoice-button eazinvoice-button-primary" type="submit"><?php esc_html_e( 'Search', 'eazinvoice-billing-workspace-msmes' ); ?></button>
					</div>
				</form>
			</section>
			<section class="eazinvoice-search-results" aria-live="polite">
				<?php if ( empty( $results ) ) : ?>
					<div class="eazinvoice-card eazinvoice-search-empty">
						<h2><?php esc_html_e( 'No matching feature found', 'eazinvoice-billing-workspace-msmes' ); ?></h2>
						<p><?php esc_html_e( 'Try a broader word such as invoice, PO, settings, API, gateway, help, or privacy.', 'eazinvoice-billing-workspace-msmes' ); ?></p>
					</div>
				<?php else : ?>
					<?php foreach ( $results as $feature ) : ?>
						<a class="eazinvoice-feature-result" href="<?php echo esc_url( $feature['url'] ); ?>">
							<span>
								<strong><?php echo esc_html( $feature['label'] ); ?></strong>
								<small><?php echo esc_html( $feature['description'] ); ?></small>
							</span>
							<span class="dashicons dashicons-arrow-right-alt2" aria-hidden="true"></span>
						</a>
					<?php endforeach; ?>
				<?php endif; ?>
			</section>
		</div>
		<?php
	}

	/**
	 * Render plugin privacy and data-use guidance.
	 */
	public function render_privacy_page() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}
		?>
		<div class="wrap eazinvoice-admin">
			<?php $this->render_admin_nav( 'privacy' ); ?>
			<section class="eazinvoice-hero eazinvoice-privacy-hero">
				<div>
					<p class="eazinvoice-kicker"><?php esc_html_e( 'Privacy and data use', 'eazinvoice-billing-workspace-msmes' ); ?></p>
					<h1><?php esc_html_e( 'Know where your information goes', 'eazinvoice-billing-workspace-msmes' ); ?></h1>
					<p><?php esc_html_e( 'A clear summary for WordPress site administrators using the EazInvoice plugin.', 'eazinvoice-billing-workspace-msmes' ); ?></p>
				</div>
				<a class="eazinvoice-button" href="<?php echo esc_url( 'https://www.eazinvoice.com/apps/web/privacy.html' ); ?>" target="_blank" rel="noopener noreferrer"><?php esc_html_e( 'Read EazInvoice Privacy Policy', 'eazinvoice-billing-workspace-msmes' ); ?></a>
			</section>
			<div class="eazinvoice-privacy-layout">
				<section class="eazinvoice-card">
					<h2><?php esc_html_e( 'Information stored in WordPress', 'eazinvoice-billing-workspace-msmes' ); ?></h2>
					<p><?php esc_html_e( 'The plugin stores its settings and local invoice and PO/WO records in this WordPress website database. Records can include customer or vendor names, contact details, addresses, tax identifiers, line items, totals, and payment status.', 'eazinvoice-billing-workspace-msmes' ); ?></p>
				</section>
				<section class="eazinvoice-card">
					<h2><?php esc_html_e( 'External EazInvoice connection', 'eazinvoice-billing-workspace-msmes' ); ?></h2>
					<p><?php esc_html_e( 'The plugin contacts the configured EazInvoice service only when an administrator validates the API connection or uses a connected feature. Validation sends the configured account email and API key over HTTPS.', 'eazinvoice-billing-workspace-msmes' ); ?></p>
				</section>
				<section class="eazinvoice-card">
					<h2><?php esc_html_e( 'Public website button', 'eazinvoice-billing-workspace-msmes' ); ?></h2>
					<p><?php esc_html_e( 'The public EazInvoice button is disabled by default. It appears only after a site administrator enables it or deliberately adds the EazInvoice shortcode to a page.', 'eazinvoice-billing-workspace-msmes' ); ?></p>
				</section>
				<section class="eazinvoice-card">
					<h2><?php esc_html_e( 'Payments and secrets', 'eazinvoice-billing-workspace-msmes' ); ?></h2>
					<p><?php esc_html_e( 'This plugin does not store Razorpay Key Secret or webhook secrets. Payment credentials remain in the connected EazInvoice service and are never printed on the public WordPress website.', 'eazinvoice-billing-workspace-msmes' ); ?></p>
				</section>
				<section class="eazinvoice-card">
					<h2><?php esc_html_e( 'Your responsibility as site owner', 'eazinvoice-billing-workspace-msmes' ); ?></h2>
					<p><?php esc_html_e( 'You remain responsible for telling visitors and customers what you collect, why you collect it, how long you retain it, and which connected services process it. WordPress now includes suggested EazInvoice text under Settings > Privacy.', 'eazinvoice-billing-workspace-msmes' ); ?></p>
				</section>
				<section class="eazinvoice-card">
					<h2><?php esc_html_e( 'Access and deletion', 'eazinvoice-billing-workspace-msmes' ); ?></h2>
					<p><?php esc_html_e( 'Only WordPress administrators can access these plugin pages. Site owners should follow their legal retention obligations before correcting or deleting financial records and should also manage connected EazInvoice account data separately.', 'eazinvoice-billing-workspace-msmes' ); ?></p>
				</section>
			</div>
		</div>
		<?php
	}

	/**
	 * Render SOP and user guidance page.
	 */
	public function render_help_page() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}

		$workspace_url = $this->get_create_invoice_url();
		?>
		<div class="wrap eazinvoice-admin">
			<?php $this->render_admin_nav( 'help' ); ?>
			<section class="eazinvoice-hero">
				<div>
					<p class="eazinvoice-kicker"><?php esc_html_e( 'Operating SOP', 'eazinvoice-billing-workspace-msmes' ); ?></p>
					<h1><?php esc_html_e( 'How to use EazInvoice inside WordPress', 'eazinvoice-billing-workspace-msmes' ); ?></h1>
					<p><?php esc_html_e( 'Use this page as the quick operating manual for the free plugin and paid EazInvoice-connected tiers.', 'eazinvoice-billing-workspace-msmes' ); ?></p>
				</div>
				<a class="eazinvoice-button" href="<?php echo esc_url( $workspace_url ); ?>" target="_blank" rel="noopener noreferrer"><?php esc_html_e( 'Open Workspace', 'eazinvoice-billing-workspace-msmes' ); ?></a>
			</section>
			<div class="eazinvoice-grid">
				<section class="eazinvoice-card">
					<h2><?php esc_html_e( 'Setup', 'eazinvoice-billing-workspace-msmes' ); ?></h2>
					<ol>
						<li><?php esc_html_e( 'Open Settings and add your EazInvoice account email, API key, workspace URL, and API settings URL.', 'eazinvoice-billing-workspace-msmes' ); ?></li>
						<li><?php esc_html_e( 'Validate the API connection from API Access.', 'eazinvoice-billing-workspace-msmes' ); ?></li>
						<li><?php esc_html_e( 'Keep the automatic public button enabled only where it makes sense for your website.', 'eazinvoice-billing-workspace-msmes' ); ?></li>
					</ol>
				</section>
				<section class="eazinvoice-card">
					<h2><?php esc_html_e( 'Free workflow', 'eazinvoice-billing-workspace-msmes' ); ?></h2>
					<ol>
						<li><?php esc_html_e( 'Create invoice or PO/WO drafts from the plugin admin pages.', 'eazinvoice-billing-workspace-msmes' ); ?></li>
						<li><?php esc_html_e( 'Create final records only after customer/vendor, amount, tax, and terms are complete.', 'eazinvoice-billing-workspace-msmes' ); ?></li>
						<li><?php esc_html_e( 'Use the EazInvoice workspace for full reporting and subscription-aware features.', 'eazinvoice-billing-workspace-msmes' ); ?></li>
					</ol>
				</section>
				<section class="eazinvoice-card">
					<h2><?php esc_html_e( 'Paid workflow', 'eazinvoice-billing-workspace-msmes' ); ?></h2>
					<p><?php esc_html_e( 'Standard, Pro, and Business features unlock through the connected EazInvoice account. Upgrade from the Subscription page and then validate API access again.', 'eazinvoice-billing-workspace-msmes' ); ?></p>
				</section>
				<section class="eazinvoice-card">
					<h2><?php esc_html_e( 'Release checklist', 'eazinvoice-billing-workspace-msmes' ); ?></h2>
					<ol>
						<li><?php esc_html_e( 'Run Plugin Check before each WordPress.org upload.', 'eazinvoice-billing-workspace-msmes' ); ?></li>
						<li><?php esc_html_e( 'Confirm readme stable tag, plugin version, and license headers match.', 'eazinvoice-billing-workspace-msmes' ); ?></li>
						<li><?php esc_html_e( 'Commit updated plugin files to WordPress.org SVN trunk with banners and icons in assets.', 'eazinvoice-billing-workspace-msmes' ); ?></li>
					</ol>
				</section>
			</div>
		</div>
		<?php
	}

	/**
	 * Render the automatic public website button.
	 */
	public function render_floating_invoice_button() {
		$settings = $this->get_settings();

		if ( '1' !== $settings['auto_button'] || is_admin() ) {
			return;
		}

		$url      = $this->get_create_invoice_url();
		$label    = $settings['button_label'];
		$position = 'bottom-left' === $settings['button_position'] ? 'bottom-left' : 'bottom-right';

		echo '<div class="eazinvoice-floating-cta eazinvoice-floating-cta-' . esc_attr( $position ) . '"><a href="' . esc_url( $url ) . '" target="_blank" rel="noopener noreferrer">' . esc_html( $label ) . '</a></div>';
	}
}
