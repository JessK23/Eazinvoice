<?php
/**
 * Plugin Name: EazInvoice - Invoicing for MSMEs
 * Plugin URI: https://www.eazinvoice.com/wordpress
 * Description: Connect WordPress sites to EazInvoice for simple invoice links, customer billing CTAs, and upgrade-ready MSME invoicing workflows.
 * Version: 1.0.0
 * Requires at least: 6.0
 * Requires PHP: 7.4
 * Author: EazInvoice
 * Author URI: https://www.eazinvoice.com
 * Text Domain: eazinvoice
 * Domain Path: /languages
 * License: GPLv2 or later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 *
 * @package EazInvoice
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'EAZINVOICE_VERSION', '1.0.0' );
define( 'EAZINVOICE_PLUGIN_FILE', __FILE__ );
define( 'EAZINVOICE_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'EAZINVOICE_PLUGIN_URL', plugin_dir_url( __FILE__ ) );

require_once EAZINVOICE_PLUGIN_DIR . 'src/index.php';

add_action( 'plugins_loaded', array( 'EazInvoice_Plugin', 'instance' ) );
